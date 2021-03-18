require("dotenv").config();
var sslRedirect = require("heroku-ssl-redirect");

// Twillio config
const twilioAuthToken =
	process.env.HEROKU_AUTH_TOKEN || process.env.LOCAL_AUTH_TOKEN;
const twilioAccountSID =
	process.env.HEROKU_TWILLIO_SID || process.env.LOCAL_TWILLIO_SID;
const twilio = require("twilio")(twilioAccountSID, twilioAuthToken);
const express = require("express");
const path = require("path");
const app = express();

const http = require("http").createServer(app);
const io = require("socket.io")(http);
const chalk = require("chalk");

app.use(sslRedirect());

// BEGIN SOCKET-IO COMMUNICATION FOR WEBRTC: When a socket connects, set up the specific listeners we will use
io.on("connection", (socket: any) => {
	// When a client tries to join a room, only allow them if they are first or second in the room. Otherwise it is full.
	socket.on("join", (room: string, acknowledgement: Function) => {
		console.log("Client joining: ", room);
		acknowledgement();

		var clients = io.sockets.adapter.rooms[room];
		var numClients: number =
			typeof clients !== "undefined" ? clients.length : 0;
		if (numClients === 0) {
			socket.join(room);
		} else if (numClients < 15) {
			socket.join(room);
			// When the client is not the first to join the room, all clients are ready.
			console.log("Ready message broadcasted to: ", room);
			socket.broadcast.to(room).emit("willInitiateCall", socket.id, room);
		} else {
			console.log(
				room,
				" already full with ",
				numClients,
				"clients in the room."
			);
			socket.emit("full", room);
		}
	});

	// Client is disconnecting from the server
	socket.on("disconnecting", () => {
		var room = Object.keys(socket.rooms).filter(item => item != socket.id); // Socket joins a room of itself, remove that
		// console.log("Client disconnected from: ", room);
		socket.broadcast.to(room).emit("leave", socket.id);
	});

	// When receiving the token message, use the Twilio REST API to request an token to get ephemeral credentials to use the TURN server.
	socket.on("token", (room: string, uuid: string) => {
		console.log("Received token request to:", room);
		twilio.tokens.create((err: string, response: string) => {
			if (err) {
				console.log(err, "for", room);
			} else {
				console.log(
					room + ": Token generated. Returning it to the browser client"
				);
				socket.emit("token", response, uuid);
			}
		});
	});

	// Relay candidate messages
	socket.on("candidate", (candidate: string, room: string, uuid: string) => {
		console.log("Received candidate. Broadcasting...", room);
		io.to(uuid).emit("candidate", candidate, socket.id);
	});

	// Relay offers
	socket.on("offer", (offer: string, room: string, uuid: string) => {
		console.log(
			"Offer from " + socket.id + "... emitting to " + uuid + "in room: ",
			room
		);
		io.to(uuid).emit("offer", offer, socket.id);
	});

	// Relay answers
	socket.on("answer", (answer: string, room: string, uuid: string) => {
		console.log(
			"Answer from " + socket.id + "... emitting to " + uuid + "in room: ",
			room
		);
		io.to(uuid).emit("answer", answer, socket.id);
	});
});

const port = process.env.PORT || 3001;
http.listen(port, () => {
	if (process.env.NODE_ENV === "development") {
		console.warn(chalk`📙: When running in development mode, connections to the server will not be over HTTPS. 
      If you want to connect to a call from an address {green.bold besides localhost or from another computer},
      you must use a service like ngrok or localtunnel.`);
	}

	console.log(
		chalk.green(
			"Running Catalyst server on  ",
			chalk.underline.bgWhite.black.bold(`http://localhost:${port}`)
		)
	);
});
