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
	};


var io = require('socket.io').listen(require('https').createServer(credentials, app).listen(8000)),
	i = 0;


var getUser = function(uid, c){
	fetch("https://api.twitch.tv/helix/users?id="+uid, { 
		headers: { 'Client-ID': config.twitch_clientid,
	  }})
	.then(response => response.json())
	.then(function(d){
		c(d["data"][0])
	})
	.catch((error) => {
		console.error(error)
	})
}

var getPlayers = function() {
	var data = [];
	Object.keys(io.sockets.connected).forEach(function(id){
		var d = io.sockets.connected[id].player;
		if(d) data.push(d);
	});
	return data
}


io.on('connection', function(socket){
	const id = (i++).toString();
	socket.channel = "development"
	socket.on('connected',function(data){
		socket.join(socket.channel);
		socket.player = data;
		socket.player.id = id
		socket.player.name = "Player "+id
		socket.emit('connected', {
			"id": id,
			"players": getPlayers()
		});
		io.sockets.in(socket.channel).emit('joined', socket.player);
		socket.on('move',function(data){
			socket.player.x = data.x
			socket.player.y = data.y
			socket.player.d = data.d
			socket.player.moving = data.moving
			io.sockets.in(socket.channel).emit('move', socket.player);
		});
		socket.on('message',function(message){
			socket.player.message = message;
			io.sockets.in(socket.channel).emit('message',socket.player);
			socket.player.message = "";
		});
		socket.on('update',function(data){
			if(data.hasOwnProperty("skin")) {
				socket.player.skin = data.skin;
			}
			if(data.hasOwnProperty("name")) {
				socket.player.name = data.name;
			}
			
			io.sockets.in(socket.channel).emit('update',socket.player);
		});
	});
	socket.on('disconnect',function(){
		io.sockets.in(socket.channel).emit('remove', socket.player);
		delete io.sockets.connected[socket["id"]];
		socket.leave(socket.channel);
	});
});