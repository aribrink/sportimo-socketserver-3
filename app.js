// /*
//  Socket Server Instance

//  Copyright (c) Bedbug Studio 2016
//  Author: Aris Brink

//  Permission is hereby granted, free of charge, to any person obtaining
//  a copy of this software and associated documentation files (the
//  "Software"), to deal in the Software without restriction, including
//  without limitation the rights to use, copy, modify, merge, publish,
//  distribute, sublicense, and/or sell copies of the Software, and to
//  permit persons to whom the Software is furnished to do so, subject to
//  the following conditions:

//  The above copyright notice and this permission notice shall be
//  included in all copies or substantial portions of the Software.

//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
//  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
//  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
//  NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
//  LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
//  OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
//  WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

//  */

// 'use strict';


var _ = require('lodash'),
    mongoose = require('mongoose'),
    redis = require('redis'),
    moment = require('moment');

// New relic test
require('newrelic');

var mongoCreds = require('./config/mongoConfig');


// Setup Node environment

console.log("Server set environment: " + process.env.NODE_ENV);
if (!process.env.NODE_ENV)
    process.env.NODE_ENV = "development";
console.log("Set to: "+process.env.NODE_ENV);

// Setup MongoDB conenction

var mongoConnection = process.env.MONGO_URL || ('mongodb://' + mongoCreds[process.env.NODE_ENV].user + ':' + mongoCreds[process.env.NODE_ENV].password + '@' + mongoCreds[process.env.NODE_ENV].url);

mongoose.connect(mongoConnection, {
    useNewUrlParser: true,
    useFindAndModify: false,
    useCreateIndex: true,
    useUnifiedTopology: true
}, function (err, res) {
    if (err) {
        console.log('ERROR connecting to: ' + mongoConnection + '. ' + err);
    } else {
        LOG("MongoDB Connected.");
    }
});

try {
    // Bootstrap mongoose models
    var userActivities = require('./models/trn_user_activity');
    var users = require('./models/user');
    var leaderboard = require('./models/trn_score');
    var trnMatches = require('./models/trn_match');
    var userSubscriptions = require('./models/trn_subscription');
} catch (err) {
    console.error(err);
}

var InstId = Math.floor((Math.random() * 1000) + 1);// process.env.SERVO_ID ? process.env.SERVO_ID : process.pid;


// Initialize and connect to the Redis datastore

var redisCreds = process.env.REDIS_URL || process.env.REDISCLOUD_URL || 'redis://h:pa4daaf32cd319fed3e9889211b048c2dabb1f723531c077e5bc2b8866d1a882e@ec2-63-32-222-217.eu-west-1.compute.amazonaws.com:6469';

var PublishChannel = redis.createClient(redisCreds);

PublishChannel.on("error", function (err) {
    console.error(err);
});


// //----------------
// //  Server Vars
// //----------------
var lastEventID = 0;
var LogStatus = 2;
var ActiveGames = {};

function LOG(s) {
    if (LogStatus > 1)
        console.log(moment().format() + "[" + process.pid + "]: " + s);
}




// //----------------------------------------
// //              Users
// //----------------------------------------
// var instUsers = [];

// Deprecated - No Need Anymore
var DisconnectUser = function (user) {

    // Disable it for now
    // return;

    const json = JSON.stringify({
        type: "disconnect_user",
        client: user.uid,
        data: { "message": { "en": "You logged in from another device. We are sorry but you can only have one active connection." } }
    });


    removeUser(user);
};



// SOCKET.IO IMPLEMENTATION

let app = require('express')();
let http = require('http').Server(app);

// copied CORS support from https://stackoverflow.com/a/54309080
let io = require('socket.io')(http, {
    handlePreflightRequest: (req, res) => {
        const headers = {
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Origin": req.headers.origin, //or the specific origin you want to give access to,
            "Access-Control-Allow-Credentials": true
        };
        res.writeHead(200, headers);
        res.end();
    }
});

// Restricting to a namespace, in order to facilitate nginx or haproxy to root to the socket server looking at the first path fragment (/client-socket)
// as in https://socket.io/docs/#Restricting-yourself-to-a-namespace
io.on('connection', (socket, req) => {
    var json = ({
        type: "response_info",
        data: "Succesfull connection to Socket server"
    });

    console.log('-- welcome');

    var ipList = req && req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(/\s*,\s*/) : [];
    socket.ipAddress = ipList.length > 0 ? ipList[ipList.length - 1] : "Unknown";

    socket.emit('welcome', json);

    var user;

    socket.on('register', function (payload) {

        console.log('-- register');

        if (payload.admin) {
            // Register the new user
            user = {
                uid: payload.uid,
                uname: payload.uname,
                room: "Administration",
                admin: true,
                socketId: socket.id
            };
            LOG("Administrator " + user.uname + " with id: " + user.uid + " has been registered to this instance from ip " + socket.ipAddress);
        }
        else {

            // Safeguard user info
            socket.uid = payload.uid;
            socket.uname = payload.uname;
            socket.admin = payload.admin;

            user = {
                uid: payload.uid,
                uname: payload.uname,
                room: "Lobby",
                admin: false,
                socketId: socket.id
            };
            // LOG("User with id: " + user.uid + " has been registered to this instance from ip " + socket.ipAddress);

        }
        // Join the appropriate user room
        socket.join(user.room);

        // console.log("Setting user status");

        users.findOneAndUpdate({ _id: user.uid }, { $set: { isOnline: true } }, { new: true }, function (e, r) {
            if (e)
                console.log(e);
            // console.log(r);
        });

        // Safeguard that there is no other user with the same id in the instance
        
        instUsers.push(user);
        
        console.log("[REGISTERED] User: " + user.uname + "| Id: " + user.uid + "| Room: " + user.room + " | SocketId: " + user.socketId);

        // instUsers.forEach(x => {
        //     console.log("User: " + x.uname + "| Id: " + x.uid + "| Room: " + x.room + " | SocketId: " + x.socketId);
        // })

        // const json = {
        //     type: "response_info",
        //     client: user.uid,
        //     data: user.uid + " registered to Socket Server"
        // };
        socket.emit('registered', user, function (sendError) {
            if (sendError) {
                console.error(`Error responding on socket registration from user ${user.uid}: ${sendError.stack}`);
            }
        });
    });

    socket.on('subscribe', function (payload) {

        console.log('-- subscribe');
        // if (!user) {            
        //     if (socket.uid) {                            

        //         user = {
        //             uid: socket.uid,
        //             uname: socket.uname,
        //             room: "Lobby",
        //             admin: socket.admin,
        //             socketId: socket.id
        //         };
        //         users.findOneAndUpdate({ _id: user.uid }, { $set: { isOnline: true } }, { new: true }, function (e, r) {
        //             if (e)
        //                 console.log(e);
        //         });
        //         instUsers.push(user);
        //         LOG("LOST AND FOUND: " + user.uid + " | " + user.uname);
        //     }
        //     else {
        //         LOG("Disconnecting unidentified user from instance");
        //         socket.close(1008, "User is unidentified");
        //         return;
        //     }
        // }

        try {
            user.room = payload.room;
            socket.join(user.room);
            // LOG(user.uid + " with socketId:"+ user.socketId+" subscribed to:" + user.room);
            console.log("[SUBSCRIBED] User: " + user.uname + "| Id: " + user.uid + "| Room: " + user.room + " | SocketId: " + user.socketId);
            // instUsers.forEach(x => {
            //     console.log("User: " + x.uname + "| Id: " + x.uid + "| Room: " + x.room + " | SocketId: " + x.socketId);
            // })
            // Enter leaderboard entry with user data
            leaderboard.AddLeaderboardEntry(user.uid, user.room);

            // Update Activities and Stats
            userActivities.UpdateAllForUser(user.uid, user.room, { $set: { isPresent: true } }, { upsert: true }, function (err, results) {
                if (err)
                    console.log(err);
            });
            //const json = {
            //    type: "response_info",
            //    client: user.uid,
            //    data: user.uid + " subscribed to:" + user.room
            //};

            // io.to(user.room).emit('message',json);
            io.to(payload.room).emit('message', user);
        }
        catch (err) {
            console.log(err.stack);
        }
    });

    socket.on('disconnect', function () {
        console.log('User disconnected: ' + (!user ? 'unregistered' : user.uname) + ":" + (!user ? 'undefined' : user.uid));
        removeUser(user);
    });

    socket.on('add-message', (message) => {
        io.emit('message', { type: 'new-message', text: message });
    });
});

http.listen(process.env.PORT || 3031, () => {
    console.log('started on port: '+(process.env.PORT||3031));
});

var redisclient = redis.createClient(redisCreds);
if (redisclient) {
    redisclient.on("error", function (err) {
        LOG(err);
    });

    redisclient.on("subscribe", function (channel, count) {
        LOG("SOCKET INSTANCE subscribed to PUB/SUB channel");
    });

    redisclient.on("unsubscribe", function (channel, count) {
        LOG("SOCKET unsubscribed from PUB/SUB channel");
    });

    redisclient.on("end", function () {
        console.log("{Connection ended}");
    });

    if (redisclient)
        redisclient.subscribe("socketServers");

    redisclient.on("message", function (channel, data) {
        var objectdata = JSON.parse(data);

        // Establishing payload
        let message = {};
        try {
            message = JSON.parse(data);
        }
        catch (err) {
            message = data;
        }

        if (message.server) {
            return;
        }

        LOG(payload);

        // Should the message be distributed by web sockets?
        if (message.sockets) {
            var payload = message.payload;
            payload.inst = InstId;

            // if (!message.admin && (payload.type !="Stats_changed"))
            //     console.log(JSON.stringify(payload, null, "\t")+",");

            if (message.clients) { // Loop all users                
                _.each(message.clients, function (client) {
                    if (client) {
                        // const evalUser = findUser(client); 
                        // if (evalUser && evalUser.socketId) {
                        //     console.log("Found in instance. Sending a message to client:" + client +" with socketId:"+evalUser.socketId);
                        //     var payloadAsString = JSON.stringify(payload, null, "\t");
                        //     console.log(payloadAsString);                                                       
                        //     io.to(evalUser.socketId).emit('message', payload);
                        // }
                        const sendUsersIds = _.filter(instUsers, { uid: client });
                        const messageRoom = payload.room || null;
                        sendUsersIds.forEach(eachUser => {
                            // SP3-572 Received a notification for a card played in match but with team names from another match
                            // Send socket message if either it is not sent to a specific game room, or it is sent to a room where the user is already subscribed to
                            if (!messageRoom || eachUser.room === messageRoom)
                                io.to(eachUser.socketId).emit('message', payload);
                        });                                             
                    }
                })
            }
            else {
                if (message.admin)
                    io.to('Administration').emit('message', payload);
                else{
                    io.to(payload.room).emit('message', payload); // broadcast(JSON.stringify(payload), message.admin, payload.room);
                    LOG(payload);
                }
            }
        }
        else {
            const payload = message.payload;
            // If we received a command from another instance to disconnect user with the provided id

            if (payload.type === "disconnect_user" && payload.data.pid != InstId) {
                // console.log(payload)
                var evalUser = findUser(payload.data.uid);
                if (evalUser)
                    DisconnectUser(evalUser);
            }
        }

    });
}
var instUsers = [];

var findUser = function (id) {
    return _.find(instUsers, { uid: id });
};

var removeUser = function (user) {
    LOG("Removed user: " + !user ? 'undefined' : user.uid);
    instUsers = _.without(instUsers, user);

};