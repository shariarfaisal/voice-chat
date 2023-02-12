const path = require("path");
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const port = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const Db = require("./DB")(io);

app.use(express.static(path.join(__dirname, "../public")));

io.on("connection", (socket) => {
  socket.on("user:create", ({ name, location }, callback) => {
    const user = Db.newUser({ id: socket.id, name, location });
    socket.emit("sendUserData", user);
    callback();
  });

  socket.on("room:request", (callback) => {
    Db.chatRequest(socket, callback);
  });

  socket.on("room:join", (id, callback) => {
    Db.joinRoom(socket, id);
    callback("Stranger joined");
  });

  socket.on(
    "room:data:post",
    ({ room, id, user, audio, duration }, callback) => {
      socket.broadcast
        .to(room)
        .emit("room:data:get", { name: user.name, id, audio, duration, room });
      callback();
    }
  );

  socket.on("room:data:received", ({ room, id }) => {
    socket.broadcast.to(room).emit("room:data:reached", id);
  });

  // chat cancel
  socket.on("room:cancel", (roomId) => {
    Db.chatCancel(socket, roomId);
  });

  // speaking start
  socket.on("room:loading:start", (roomId) => {
    socket.broadcast.to(roomId).emit("room:loading:started");
  });

  // speaking stop
  socket.on("room:loading:stop", (roomId) => {
    socket.broadcast.to(roomId).emit("room:loading:stoped");
  });

  socket.on("disconnect", () => {
    Db.userDisconnectd(socket);
  });
});

server.listen(port, () => {
  console.log(`server running on port ${port}`);
});
