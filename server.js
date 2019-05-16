const express = require('express'),
	fs = require('fs'),
	fetch = require('node-fetch'),
	app = express(),
	config = require('../src/Config'),
	credentials = {
		ca:   typeof config.server.host!="localhost" ? fs.readFileSync(config.server.ssl_dir+'chain.pem') : null,
		key:  fs.readFileSync(config.server.ssl_dir+'privkey.pem'),
		cert: fs.readFileSync(config.server.ssl_dir+'cert.pem'),
		secureProtocol: 'SSLv23_method',
	},
	TwitchJS = require('twitch-js')

var io = require('socket.io').listen(require('https').createServer(credentials, app).listen(8000)),
	i = 0,
	chat_clients = {},
	channels = [],
	ids = {}

var getUser = function(data, c){
	fetch("https://api.twitch.tv/helix/users?id="+data["user_id"], { 
		headers: { 'Client-ID': data["clientId"],
	  }})
	.then(response => response.json())
	.then(function(d){
		c(d["data"][0])
	})
	.catch((error) => {
		console.error(error)
	})
}

var getPlayers = function(channel) {
	var data = [];
	Object.keys(io.sockets.connected).forEach(function(id){
		var d = io.sockets.connected[id].player;
		if(d && io.sockets.connected[id].channel==channel && d.hasOwnProperty("x")) data.push(d);
	});
	return data
}

var isPlayer = function(d,channel) {
	return d.hasOwnProperty("x") && d.hasOwnProperty("channel")
}

io.on('connection', function(socket){
	const id = (i++).toString();
	socket.channel = "development"
	socket.player = {id: id};
	socket.init = false
	socket.on('connected',function(data){

		socket.join(socket.channel);
		for(key in data) {
			socket.player[key] = data[key]
		}
		socket.player.id = id
		socket.player.loaded = true;
		socket.init = true
		console.log(getPlayers(socket.channel));
		//console.log(io.sockets.in(socket.channel));
		socket.emit('connected', {
			"id": id,
			"players": getPlayers(socket.channel)
		});

		
		if(isPlayer(socket.player)) {
			console.log("=== Join ===")
			console.log(socket.player)
			io.sockets.in(socket.channel).emit('joined', socket.player);
			io.sockets.in(socket.channel).emit('update', socket.player);
		}
		socket.on('move',function(data){
			if(isPlayer(socket.player)) {
				console.log("=== Move ===")
				socket.player
				socket.player.x = data.x
				socket.player.y = data.y
				socket.player.d = data.d
				socket.player.moving = data.moving
				io.sockets.in(socket.channel).emit('move', socket.player);
			}
			
		});
		socket.on('message',function(message){
			if(isPlayer(socket.player)) {
				console.log("=== message ===")
				socket.player
				socket.player.message = message;
				io.sockets.in(socket.channel).emit('message',socket.player);
				socket.player.message = "";
			}
		});
		socket.on('jump',function(){
			if(isPlayer(socket.player)) {
				io.sockets.in(socket.channel).emit('jump', socket.player);
			}
		});
		socket.on('update',function(data){
			if(isPlayer(socket.player)) {
				console.log("=== update ===")
				socket.player
				if(data.hasOwnProperty("skin")) {
					socket.player.skin = data.skin;
				}
				if(data.hasOwnProperty("name")) {
					socket.player.name = data.name;
				}
				io.sockets.in(socket.channel).emit('update',socket.player);
			}
		});
		

		
	});
	socket.on('auth',function(data){
		//socket.leave("development");
		socket.channel = data["channelId"]
		//socket.player.user_id = data["user_id"]
		socket.player.name = data["user_id"]
		getUser(data, function(d){
			socket.player.name = d["display_name"]
			ids[socket.player.name] = socket.player.id
			if(socket.init) {
				io.sockets.in(socket.channel).emit('joined', socket.player);
				io.sockets.in(socket.channel).emit('update', socket.player);
			}
			//io.sockets.in(socket.channel).emit('update', socket.player);
			
			if(channels.indexOf(socket.channel) === -1){
				channels.push(socket.channel);
				getUser({ 
					"user_id":data["channelId"],
					"clientId":"9zc9rmh14ylh4b1y3z9a0tavpe0qym" }, function(d){
					var channel_name = "#"+d["login"]
					chat_clients[channel_name] = new TwitchJS.client({
						channels: [channel_name], 
						identity: {
						username: "FukleBot",
						password: "oauth:93girx4jk9z6fm41goffk8flpdcnso"
						},
					});
					chat_clients[channel_name].on('chat', (channel, userstate, message, self) => {
						console.log(ids)
						console.log(ids[userstate['display-name']]);
						console.log(userstate);
						io.sockets.in(socket.channel).emit('message',{
							"id":ids[userstate['display-name']],
							"message": message
						});
						//console.log(`Message "${message}" received from ${userstate['display-name']}`);
						if (self) return;
					});
					chat_clients[channel_name].connect();
				});	
			}
		});	
	});
	socket.on('disconnect',function(){
		io.sockets.in(socket.channel).emit('remove', socket.player);
		delete io.sockets.connected[socket["id"]];
		socket.leave(socket.channel);
	});
});