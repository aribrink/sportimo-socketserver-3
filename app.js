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


// Setup MongoDB conenction

var mongoConnection = 'mongodb://' + mongoCreds[process.env.NODE_ENV].user + ':' + mongoCreds[process.env.NODE_ENV].password + '@' + mongoCreds[process.env.NODE_ENV].url;

mongoose.connect(mongoConnection, function (err, res) {
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

var redisCreds = process.env.REDIS_URL || 'redis://h:pa4daaf32cd319fed3e9889211b048c2dabb1f723531c077e5bc2b8866d1a882e@ec2-63-32-222-217.eu-west-1.compute.amazonaws.com:6469';

var PublishChannel = redis.createClient(redisCreds);

PublishChannel.on("error", function (err) {
    console.error(err);
});

// var redisclient = redis.createClient(redisCreds);
// if (redisclient) {
//     redisclient.on("error", function (err) {
//         LOG(err);
//     });

//     redisclient.on("subscribe", function (channel, count) {
//         LOG("SOCKET INSTANCE subscribed to PUB/SUB channel");
//     });

//     redisclient.on("unsubscribe", function (channel, count) {
//         LOG("SOCKET unsubscribed from PUB/SUB channel");
//     });

//     redisclient.on("end", function () {
//         console.log("{Connection ended}");
//     });

//     if (redisclient)
//         redisclient.subscribe("socketServers");

//     redisclient.on("message", function (channel, data) {
//         var objectdata = JSON.parse(data);

//         // if (!objectdata.admin && !objectdata.server && (objectdata.payload.type == 'Card_won' || objectdata.payload.type == 'Card_lost')) {
//         // console.log("---------------------------------------------------");
//         // console.log("[REDIS]");
//         // console.log(objectdata);
//         // console.log("---------------------------------------------------");
//         // }
//         // else
//         //  console.log(objectdata);

//         // Establishing payload
//         let message = {};
//         try {
//             message = JSON.parse(data);
//         }
//         catch (err) {
//             message = data;
//         }

//         if (message.server) {
//             return;
//         }

//         // Should the message be distributed by web sockets?
//         if (message.sockets) {
//             var payload = message.payload;

//             payload.inst = InstId;

//             // Is the payload directed to specific user or users?
//             // if (message.client) {
//             //     // console.log("Sending a message to one client:"+message.client);
//             //     var evalUser = findUser(message.client);

//             //     if (evalUser) {
//             //         // console.log("Found him");
//             //         evalUser.wss.send(JSON.stringify(payload));
//             //     }
//             // } else
//             if (message.clients) { // Loop all users
//                 _.each(message.clients, function (client) {
//                     if (client) {
//                         const evalUser = findUser(client);
//                         // console.log("Sending a message to client:" + client);
//                         // Check if have found the user and WebSocket is open
//                         if (evalUser && evalUser.wss && evalUser.wss.readyState == WebSocket.OPEN) {
//                             console.log("Found in instance. Sending a message to client:" + client);
//                             var payloadAsString = JSON.stringify(payload);
//                             evalUser.wss.send(payloadAsString, function (sendError) {
//                                 if (sendError) {
//                                     console.error(`Error sending socket payload to ${client}: ${sendError.stack}`);
//                                     console.error(`Error Payload: ${payloadAsString}`);
//                                 }
//                             });
//                         }
//                     }
//                 })
//             }
//             else
//                 io.broadcast(JSON.stringify(payload), message.admin, payload.room);

//         }
//         else {
//             const payload = message.payload;
//             // If we received a command from another instance to disconnect user with the provided id

//             if (payload.type == "disconnect_user" && payload.data.pid != InstId) {
//                 // console.log(payload)
//                 var evalUser = findUser(payload.data.uid);
//                 if (evalUser)
//                     DisconnectUser(evalUser);
//             }
//         }

//     });
// }


// var WebSocket = require('ws');
// var WebSocketServer = WebSocket.Server, //require('ws')
//     http = require('http'),
//     express = require('express'),
//     app = express();
// var server = http.createServer(app);
// server.listen(process.env.PORT || 3001);
// console.log("Listening to port: " + (process.env.PORT || 3001));
// /* SOCKETS CODE */

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

// //-------------------------------------
// //  Web Sockets / Notification System
// //-------------------------------------
// var io = new WebSocketServer({ server: server });


// io.broadcast = function (data, admin, room) {

//     //  console.log(data);
//     if (room) {
//         let roomUsers = [];
//         roomUsers = _.filter(instUsers, function (user) {
//             return user.room == room || user.room === "Administration";
//         });
//         if (roomUsers && roomUsers.length > 0) {
//             var parsedData = JSON.parse(data);
//             if (parsedData && parsedData.type)
//                 console.log("Broadcasting event [" + parsedData.type + "] in room [" + room + "] to [" + roomUsers.length + "] users.");
//             else
//                 console.log("Broadcasting in room [" + room + "] to [" + roomUsers.length + "] users.");
//             _.each(roomUsers, function (user) {
//                 try {
//                     if (user.wss && user.wss.readyState == WebSocket.OPEN)
//                         user.wss.send(data, function (sendError) {
//                             if (sendError) {
//                                 console.error(`Error sending socket payload to ${user.uid}: ${sendError.stack}`);
//                                 console.error(`Error Payload: ${data}`);
//                             }
//                         });
//                 }
//                 catch (e) {
//                     if (e && e.message)
//                         console.log(e.message);
//                 }
//             });
//         }
//     }

//     if (admin) {
//         var administrators = _.filter(instUsers, { room: "Administration" });
//         if (administrators)
//             _.each(administrators, function (administrator) {
//                 if (administrator.wss && administrator.wss.readyState == WebSocket.OPEN) {
//                     administrator.wss.send(data, function (sendError) {
//                         if (sendError) {
//                             console.error(`Error sending socket payload to ${administrator.uid}: ${sendError.stack}`);
//                             console.error(`Error Payload: ${data}`);
//                         }
//                     });
//                 }
//             })
//     }


// };

// io.on('connection', function (socket, req) {

//     // Locating IP from the request's X-FORWARDED-FOR header, as described:
//     // in ws npm page here: https://www.npmjs.com/package/ws
//     // and in Heroku help pages here: https://devcenter.heroku.com/articles/http-routing#heroku-headers
//     // and in a relevant StackOverflow page here: https://stackoverflow.com/questions/18264304/get-clients-real-ip-address-on-heroku

// var ipList = req && req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(/\s*,\s*/) : [];
// socket.ipAddress = ipList.length > 0 ? ipList[ipList.length - 1] : "Unknown";

//     var json = JSON.stringify({
//         type: "response_info",
//         data: "Succesfull connection to Socket server"
//     });
//     socket.send(json, function (sendError) {
//         if (sendError) {
//             console.error(`Error responding on socket connection: ${sendError.stack}`);
//         }
//     });


//     var user;

//     socket.on('error', function (sendError) {
//         if (sendError) {
//             if (user)
//                 console.error(`Error on user [${user.uid}] ${user.uname} socket from ip ${socket.ipAddress}: ${sendError.stack}`);
//             else
//                 console.error(`Error on socket connection from ip ${socket.ipAddress}: ${sendError.stack}`);
//         }
//     });

//     socket.on('close', function () {

//         if (user) {

//             LOG(`Client disconected: [${user.uid}] ${user.uname} from ip ${socket.ipAddress}`);

//             // LOG("Client disconected: ["+user.uid+"] "+user.uname);
//             // socket.close(1013, "Safeguard connection removal");
//             userActivities.findOneAndUpdate({ user: user.uid, room: user.room }, { $set: { isPresent: false } }, function (err, result) { });

//             users.findOneAndUpdate({ _id: user.uid }, { $set: { isOnline: false } }, function (e, r) { });
//             removeUser(user);
//         }
//         else {
//             console.error(`Client of anonymous user is disconnected from ip ${socket.ipAddress}`);
//         }
//     });

//     socket.on("message", function (data) {

//         // Establishing payload
//         var payload = {};
//         try {
//             payload = JSON.parse(data);
//         }
//         catch (err) {
//             payload = data;
//         }

//         if (payload.test) {
//             console.log("Initiating Test:");
//             setTimeout(function () {
//                 console.log("Start:");
//                 var evtData = {
//                     sockets: true,
//                     client: user.uid,
//                     payload: {
//                         time: new Date()
//                     }
//                 };

//                 for (var i = 0; i < 2000; i++) {
//                     evtData.payload.index = i;
//                     if (PublishChannel)
//                         PublishChannel.publish("socketServers", JSON.stringify(evtData));
//                 }
//             }, 2000);
//         }
//         // console.log(payload);
//         // If the request is for registration
//         if (payload.register) {

//             if (!payload.register.admin) {
//                 var userExists = findUser(payload.register.uid);

//                 if (userExists) {
//                     DisconnectUser(userExists);
//                 }
//             }

//             var evtData = {
//                 sockets: false,
//                 payload: {
//                     type: "disconnect_user",
//                     data: {
//                         pid: InstId,
//                         uid: payload.register.uid
//                     }
//                 }
//             };
//             if (PublishChannel)
//                 PublishChannel.publish("socketServers", JSON.stringify(evtData));


//             if (payload.register.admin) {
//                 // Register the new user
//                 user = {
//                     uid: payload.register.uid,
//                     uname: payload.register.uname,
//                     room: "Administration",
//                     admin: true,
//                     wss: socket
//                 };
//                 LOG("Administrator " + user.uname + " with id: " + user.uid + " has been registered to this instance from ip " + socket.ipAddress);
//             }
//             else {

//                 // Safeguard user info
//                 socket.uid = payload.register.uid;
//                 socket.uname = payload.register.uname;
//                 socket.admin = payload.register.admin;

//                 user = {
//                     uid: payload.register.uid,
//                     uname: payload.register.uname,
//                     room: "Lobby",
//                     admin: false,
//                     wss: socket
//                 }
//                 LOG("User with id: " + user.uid + " has been registered to this instance from ip " + socket.ipAddress);

//             }

//             // console.log("Setting user status");

//             users.findOneAndUpdate({ _id: user.uid }, { $set: { isOnline: true } }, { new: true }, function (e, r) {
//                 if (e)
//                     console.log(e);
//                 // console.log(r);
//             });
//             instUsers.push(user);

//             const json = JSON.stringify({
//                 type: "response_info",
//                 client: user.uid,
//                 data: user.uid + " registered to Socket Server"
//             });
//             user.wss.send(json, function (sendError) {
//                 if (sendError) {
//                     console.error(`Error responding on socket registration from user ${user.uid}: ${sendError.stack}`);
//                 }
//             });


//         }
//         else if (payload.subscribe) {
//             if (!user) {

//                 if (socket.uid) {
//                     user = {
//                         uid: socket.uid,
//                         uname: socket.uname,
//                         room: "Lobby",
//                         admin: socket.admin,
//                         wss: socket
//                     };
//                     users.findOneAndUpdate({ _id: user.uid }, { $set: { isOnline: true } }, { new: true }, function (e, r) {
//                         if (e)
//                             console.log(e);
//                         // console.log(r);
//                     });
//                     instUsers.push(user);
//                     LOG("LOST AND FOUND: " + user.uid + " | " + user.uname);
//                 }
//                 else {
//                     LOG("Disconnecting unidentified user from instance");
//                     socket.close(1008, "User is unidentified");
//                     return;
//                 }
//             }

//             try {

//                 user.room = payload.subscribe.room;
//                 LOG(user.uid + " subscribed to:" + user.room);

//                 // Enter leaderboard entry with user data
//                 leaderboard.AddLeaderboardEntry(user.uid, user.room);

//                 // Update Activities and Stats
//                 userActivities.UpdateAllForUser(user.uid, user.room, { $set: { isPresent: true } }, { upsert: true }, function (err, results) {
//                     if (err)
//                         console.log(err);
//                 });
//                 const json = JSON.stringify({
//                     type: "response_info",
//                     client: user.uid,
//                     data: user.uid + " subscribed to:" + user.room
//                 });
//                 if (user.wss.readyState == WebSocket.OPEN)
//                     user.wss.send(json, function (sendError) {
//                         if (sendError) {
//                             console.error(`Error responding on room subscription by ${user.uid} in room ${user.room}: ${sendError.stack}`);
//                         }
//                     });

//             }
//             catch (err) {
//                 console.log(err.stack);
//             }
//         }
//         else if (payload.unsubscribe) {
//             if (!user) {
//                 user = {
//                     uid: socket.uid,
//                     uname: socket.uname,
//                     room: "Lobby",
//                     admin: socket.admin,
//                     wss: socket
//                 };
//                 users.findOneAndUpdate({ _id: user.uid }, { $set: { isOnline: true } }, { new: true }, function (e, r) {
//                     if (e)
//                         console.log(e);
//                     // console.log(r);
//                 });
//                 instUsers.push(user);
//                 LOG("LOST AND FOUND: " + user.uid + " | " + user.uname);
//             }
//             try {
//                 LOG(user.uid + " unsubscribed from: " + user.room);
//                 userActivities.findOneAndUpdate({ user: user.uid, room: user.room }, { $set: { isPresent: false } }, function (err, result) {
//                     if (err)
//                         console.log(err);
//                 });
//                 user.room = "Lobby";
//                 var json = JSON.stringify({
//                     type: "response_info",
//                     client: user.uid,
//                     data: user.uid + " unsubscribed from: " + user.room
//                 });
//                 if (user.wss.readyState == WebSocket.OPEN)
//                     user.wss.send(json, function (sendError) {
//                         if (sendError) {
//                             console.error(`Error responding on room un-subscription by ${user.uid} from room ${user.room}: ${sendError.stack}`);
//                         }
//                     });
//             }
//             catch (err) {
//                 console.log(err.stack);
//             }
//         }

//     });
// });

// app.get('/', function (req, res, next) {
//     res.send(200, "All set");
// });




// //----------------------------------------
// //              Users
// //----------------------------------------
// var instUsers = [];

// Deprecated - No Need Anymore
var DisconnectUser = function (user) {

    // Disable it for now
    // return;

    // const json = JSON.stringify({
    //     type: "disconnect_user",
    //     client: user.uid,
    //     data: { "message": { "en": "You logged in from another device. We are sorry but you can only have one active connection." } }
    // });


    // if (user.wss.readyState == WebSocket.OPEN) {
    //     user.wss.send(json, function (sendError) {
    //         if (sendError) {
    //             console.error(`Error responding on user ${user.uid} disconnection due to multiple device connections: ${sendError.stack}`);
    //         }
    //     });
    //     user.wss.close(1008, "Duplicate connection found");
    // }
    // removeUser(user);
};

// var findUser = function (id) {
//     return _.find(instUsers, { uid: id });
// };

// var removeUser = function (user) {
//     LOG("Removed user: " + user.uid);
//     instUsers = _.without(instUsers, user);

// };

// // Heartbeat with stats
// var heartbeatTimeout = setInterval(sendHeartbeat, 20000);


// function sendHeartbeat() {
//     const roomCount = _.countBy(instUsers, function (obj) {
//         return obj.room;
//     });

//     const result = _.map(roomCount, function (value, key) {
//         return { room: String(key), count: value };
//     });

//     const stats = {
//         instance: InstId,
//         environment: process.env.NODE_ENV || "development",
//         connections: instUsers.length,
//         rooms: result
//     };

//     if (instUsers && instUsers.length > 0) {
//         _.each(instUsers, function (instUser) {
//             if (instUser.wss.readyState == WebSocket.OPEN)
//                 instUser.wss.send(JSON.stringify({ heartbeat: true }), function (sendError) {
//                     if (sendError) {
//                         console.error(`Error sending Heartbeat to ${instUser.uid}: ${sendError.stack}`);
//                     }
//                 });
//         });
//     }

//     const redisData = {
//         sockets: true,
//         // share this to all socket instances and to clients which are flagged admin
//         admin: true,
//         payload: {
//             type: "socket_stats",
//             system: true,
//             data: stats
//         }
//     };
//     if (PublishChannel)
//         PublishChannel.publish("socketServers", JSON.stringify(redisData));
// }

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
        // If the request is for registration
        if (!payload.admin) {
            var userExists = findUser(payload.uid);

            // if (userExists) {
            //     DisconnectUser(userExists);
            // }
        }

        // var evtData = {
        //     sockets: false,
        //     payload: {
        //         type: "disconnect_user",
        //         data: {
        //             pid: InstId,
        //             uid: payload.register.uid
        //         }
        //     }
        // };
        // if (PublishChannel)
        //     PublishChannel.publish("socketServers", JSON.stringify(evtData));


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
            LOG("User with id: " + user.uid + " has been registered to this instance from ip " + socket.ipAddress);

        }

        // console.log("Setting user status");

        users.findOneAndUpdate({ _id: user.uid }, { $set: { isOnline: true } }, { new: true }, function (e, r) {
            if (e)
                console.log(e);
            // console.log(r);
        });
        instUsers.push(user);

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
        if (!user) {
            if (socket.uid) {
                user = {
                    uid: socket.uid,
                    uname: socket.uname,
                    room: "Lobby",
                    admin: socket.admin,
                    socketId: socket.id
                };
                users.findOneAndUpdate({ _id: user.uid }, { $set: { isOnline: true } }, { new: true }, function (e, r) {
                    if (e)
                        console.log(e);
                });
                instUsers.push(user);
                LOG("LOST AND FOUND: " + user.uid + " | " + user.uname);
            }
            else {
                LOG("Disconnecting unidentified user from instance");
                socket.close(1008, "User is unidentified");
                return;
            }
        }

        try {
            user.room = payload.room;
            socket.join(user.room);
            LOG(user.uid + " with socketId:"+ user.socketId+" subscribed to:" + user.room);

            // Enter leaderboard entry with user data
            leaderboard.AddLeaderboardEntry(user.uid, user.room);

            // Update Activities and Stats
            userActivities.UpdateAllForUser(user.uid, user.room, { $set: { isPresent: true } }, { upsert: true }, function (err, results) {
                if (err)
                    console.log(err);
            });
            const json = {
                type: "response_info",
                client: user.uid,
                data: user.uid + " subscribed to:" + user.room
            };

            // io.to(user.room).emit('message',json);
            io.to(payload.room).emit('message', user);
            // if (user.wss.readyState == WebSocket.OPEN)
            //     user.wss.send(json, function (sendError) {
            //         if (sendError) {
            //             console.error(`Error responding on room subscription by ${user.uid} in room ${user.room}: ${sendError.stack}`);
            //         }
            //     });

        }
        catch (err) {
            console.log(err.stack);
        }
    });

    socket.on('disconnect', function () {
        console.log('user disconnected');
        removeUser(user);
    });

    socket.on('add-message', (message) => {
        io.emit('message', { type: 'new-message', text: message });
    });
});

http.listen(process.env.PORT || 3031, () => {
    console.log('started on port 3031');
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

        // Should the message be distributed by web sockets?
        if (message.sockets) {
            var payload = message.payload;

            payload.inst = InstId;

            if (!message.admin && (payload.type !="Stats_changed"))
                console.log(JSON.stringify(payload)+",");

            if (message.clients) { // Loop all users
                _.each(message.clients, function (client) {
                    if (client) {
                        const evalUser = findUser(client);
                        // console.log("Sending a message to client:" + client);
                        // Check if have found the user and WebSocket is open
                        if (evalUser && evalUser.socketId) {
                            console.log("Found in instance. Sending a message to client:" + client +" with socketId:"+evalUser.socketId);
                            // var payloadAsString = JSON.stringify(payload);
                            // evalUser.wss.send(payloadAsString, function (sendError) {
                            //     if (sendError) {
                            //         console.error(`Error sending socket payload to ${client}: ${sendError.stack}`);
                            //         console.error(`Error Payload: ${payloadAsString}`);
                            //     }
                            // });
                            io.to(evalUser.socketId).emit('message', payload);
                        }
                    }
                })
            }
            else {
                if (message.admin)
                    io.to('Administration').emit('message', payload);
                else{
                    io.to(payload.room).emit('message', payload); // broadcast(JSON.stringify(payload), message.admin, payload.room);
                }
            }
        }
        else {
            const payload = message.payload;
            // If we received a command from another instance to disconnect user with the provided id

            if (payload.type == "disconnect_user" && payload.data.pid != InstId) {
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
    LOG("Removed user: " + user.uid);
    instUsers = _.without(instUsers, user);

};