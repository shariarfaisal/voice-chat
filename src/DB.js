const { v4 } = require("uuid");

class Db {
  constructor(io) {
    this.users = {};
    this.usersLength = 0;
    this.rooms = {};
    this.roomsLength = 0;
    this.io = io;
  }

  newUser({ id, name, location }) {
    const user = {
      id, // socket.id
      name,
      location,
      status: 0, // initial
      joinAt: Date.now(),
      ex: [],
    };
    this.users[id] = user;
    this.usersLength++;
    return user;
  }

  chatRequest(socket, callback) {
    const user = this.users[socket.id];
    if (!user) {
      return {
        status: 400,
        msg: "User notfound",
      };
    }

    user.status = 1; // request
    socket.emit("user:data", user);
    callback();

    const getConnect = () => {
      for (let id in this.users) {
        // check is connected before ...
        const isEx = user.ex.find((i) => i === id);
        if (isEx) {
          continue;
        }

        const { status } = this.users[id];
        if (status === 1 && socket.id !== id) {
          const room = this.createRoom(socket.id, id);
          if (room) {
            // TODO: trigger event
            this.io.to(room.userA).emit("room:id", room.id);
            this.io.to(room.userB).emit("room:id", room.id);

            this.users[room.userA].ex.push(room.userB);
            this.users[room.userB].ex.push(room.userA);
          }
          return;
        }
      }
    };

    return getConnect();
  }

  joinRoom(socket, id) {
    socket.join(id);
    const user = this.users[socket.id];
    user.status = 2;
    socket.emit("user:data", user);
  }

  createRoom(userA, userB) {
    const room = {
      id: v4(),
      userA,
      userB,
      createdAt: Date.now(),
    };

    const a = this.users[userA];
    const b = this.users[userB];

    // if not found any of users then return null
    if (!a || !b) {
      return null;
    }

    if (a) {
      a.status = 2;
      a.ex.push(userB);
    }
    if (b) {
      b.status = 2;
      b.ex.push(userA);
    }

    this.rooms[room.id] = room;
    this.roomsLength++;

    return room;
  }

  chatCancel(socket, roomId) {
    if (!roomId && this.users[socket.id]) {
      this.users[socket.id].status = 0;
      this.io.to(socket.id).emit("room:canceled");
      return;
    }
    const room = this.rooms[roomId];
    if (room) {
      const { userA, userB } = room;
      this.users[userA].status = 0;
      this.users[userB].status = 0;
      delete this.rooms[roomId];
      this.io.to(room.id).emit("room:canceled");
      socket.leave(room.id);
      // this.io.sockets.clients(room.id).forEach(function(s){
      //     s.leave(room.id);
      // });
    }
  }

  userDisconnectd(socket) {
    const user = this.users[socket.id];
    if (user) {
      if (user.status === 2) {
        let room;
        for (let i in this.rooms) {
          const { userA, userB } = this.rooms[i];
          if (userA === user.id || userB === user.id) {
            room = this.rooms[i];
            break;
          }
        }

        if (room) {
          socket.broadcast.to(room.id).emit("room:canceled");
          delete this.rooms[room.id];
        }
      }

      delete this.users[socket.id];
    }
  }
}

module.exports = (io) => new Db(io);
