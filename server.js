var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io').listen(server);
var fetch = require('node-fetch');
var config = require('./config');

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

server.lastPlayderID = 0;
server.listen(process.env.PORT || 8000);

io.on('connection',function(socket){
	var uid = server.lastPlayderID++;
	uid = uid.toString();
	
    socket.on('newplayer',function(start_data){
		var start = start_data.start
		socket.player = {
			uid: uid,
			direction: {
				prev_x: start.x,
				prev_y: start.y,
				d: 'sw'
			},
			skin: start_data.skin,
			twitch_name: "Player "+uid
		};
		socket.emit('updateself',socket.player);
		socket.emit('connected',{
			uid: uid,
			players: getAllPlayers()
		});
		socket.broadcast.emit('newplayer', socket.player);
		
        socket.on('updateskin',function(data){
			socket.player.skin = data;
			socket.broadcast.emit('updateskin',socket.player);
		});
		socket.on('move',function(data){
			var d = socket.player
			d.direction = data.direction
			socket.broadcast.emit('move',d);
		});
		socket.on('updateplayer',function(d){
			getUser(d["channelId"], function(u){
				socket.player["id"] = u["id"];
				socket.player["twitch_login"] = u["login"]
				socket.player["twitch_name"] = u["display_name"]
				socket.player["twitch_image"] = u["profile_image_url"]
				socket.broadcast.emit('updateplayer',socket.player);
				socket.emit('updateself',socket.player);
			})
		});
		socket.on('updatename',function(d){

			socket.broadcast.emit('updatename',socket.player);
		});

        socket.on('disconnect',function(){
			socket.broadcast.emit('updatename',socket.player);
			delete io.sockets.connected[socket["id"]];
        });
    });
});

function getAllPlayers(){
    var players = [];
    Object.keys(io.sockets.connected).forEach(function(socketID){
        var player = io.sockets.connected[socketID].player;
        if(player) players.push(player);
    });
    return players;
}
