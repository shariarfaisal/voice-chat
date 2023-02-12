(function () {
  const home = document.querySelector(".home");
  const homeAction = document.querySelector(".home-action");
  const msgs = document.querySelector(".msgs");
  const chatEnv = document.querySelector(".chat-env");
  const startChat = document.getElementById("start-chat");
  const mikeStart = document.getElementById("mike-start");
  const recorderCounter = document.getElementById("recorder-counter");
  const mikeStop = document.getElementById("mike-stop");
  const chatCancel = document.getElementById("chat-cancel");
  const newChat = document.getElementById("new-chat");
  const startSound = new Audio("../sounds/on.mp3");
  startSound.volume = ".1";
  const notifySound = new Audio("../sounds/notify.mp3");
  notifySound.volume = ".1";

  // Modal prototypes ...
  class xModal {
    constructor() {
      this.target = document.querySelector(".x-modal");
      this.content = this.target
        ? this.target.querySelector(".x-modal--content")
        : null;
      this.closeBtn = this.content
        ? this.content.querySelector(".x-close")
        : null;
      this.body = this.content ? this.content.querySelector(".x-body") : null;
    }

    on(text) {
      if (text && this.body) this.body.innerHTML = text;
      if (this.target) {
        const x = this;
        this.target.onclick = function (e) {
          if (e.target.contains(x.target)) {
            x.off();
          }
        };

        this.target.classList.remove("d-none");
        this.target.classList.add("d-flex");
        const off = () => this.off();
        if (this.closeBtn) {
          this.closeBtn.onclick = function (e) {
            off();
          };
        }
      }
    }

    off() {
      if (this.target) {
        this.target.classList.remove("d-flex");
        this.target.classList.add("d-none");
        this.body ? (this.body.innerHTML = "") : "";
      }
    }
  }

  const socket = io({
    autoConnect: true,
  });
  let room = null;
  let user = null; // id, name, location:{ country, city, latitude, longitude }, status

  // If socket disconnected
  //
  socket.on("disconnect", () => {
    room = null;
    user = null;
    const modal = new xModal();
    const text = `
    
      <div class="text-danger" style="width: 100%">
        <span>Chat disconnected!</span> <br />
      </div>
    `;
    modal.on(text);
    setTimeout(() => {
      document.location.reload();
    }, 5000);
  });

  socket.on("connect", () => {
    console.log("connect");
  });

  // audios off when mike start...
  // check audios when audio push

  // Join server
  window.onload = function () {
    socket.emit(
      "user:create",
      {
        name: "Stranger",
        location: {
          country: "Bangladesh",
          city: "Feni",
        },
      },
      async () => {
        const homeActionLoading = document.getElementById("start-chat-loading");
        if (homeActionLoading) {
          homeActionLoading.style.display = "none";
        }
        homeAction.style.display = "flex";
      }
    );
  };

  // Receive user data from server
  socket.on("user:data", (userData) => {
    user = userData;
  });

  const searching = {
    start: function () {
      const node = document.createElement("div");
      node.className = "msgs-item text-center searching";
      node.style.cssText = "font-weight: 500;";
      node.innerHTML = `
        <div>
          <div style="font-size: 30px;"><i class='bx bx-loader-circle bx-spin bx-flip-vertical' ></i></div>
          <div>Wait for a while.</div>
          <div>We are looking someone to connect with you.</div>
        </div>
      `;
      msgs.appendChild(node);
    },
    stop: function () {
      const searchingNode = document.querySelector(".searching");
      if (searchingNode) {
        msgs.removeChild(searchingNode);
      }
    },
  };

  const speaking = {
    active: false,
    start: function () {
      if (this.active) return;
      const node = document.createElement("div");
      node.className = "py-2 my-2 text-muted speaking";
      node.innerHTML = `<div class="vi-loader">
        <div class="item item1" style="animation-delay: .0s;"></div>
        <div class="item item2" style="animation-delay: .2s;"></div>
        <div class="item item3" style="animation-delay: .4s;"></div>
      </div>`;
      msgs.appendChild(node);
    },
    stop: function () {
      this.active = false;
      const node = document.querySelector(".speaking");
      if (node) {
        msgs.removeChild(node);
      }
    },
  };

  let mikeStopFunction = null;
  let recordingCounter = 0;
  let recordingLimit = 30;
  let recorderInterval = null;

  // Start Recording
  mikeStart.onclick = async function () {
    if (!room) return;

    // if mic indicator is on, display none
    const micIndicator = document.querySelector("#mic-indicator");
    if (micIndicator) {
      micIndicator.style.display = "none";
    }

    // Check audio permission
    const permission = await navigator.permissions.query({
      name: "microphone",
    });
    if (permission.state !== "granted") {
      const modal = new xModal();
      const text = `
        <div class="text-danger" style="width: 100%">
          Please allow microphone permission of this browser to activate voice chat! And reload this page.
        </div>
      `;
      modal.on(text);
      return;
    }

    // pause all audios when recording start...
    const audios = document.getElementsByTagName("audio");
    if (audios) {
      for (let i in audios) {
        const e = audios[i];
        if (typeof e === "object") {
          e.pause();
        }
      }
    }

    // Say Speaking start to room member...
    socket.emit("room:loading:start", room);

    // start audio recording ...
    const record = await recordAudio();
    if (record) {
      mikeStopFunction = record.stop;
      record.start();

      // set recording limit ....
      recorderInterval = setInterval(() => {
        recordingCounter++;
        if (recordingCounter < recordingLimit) {
          recorderCounter.innerText = recordingCounter;
        } else {
          // recordingCounter = 0
          if (mikeStopFunction) {
            mikeStop.click();
          }
          clearInterval(recorderInterval);
          recorderInterval = null;
        }
      }, 1000);

      // recorderCounter.style.display = 'flex'
      mikeStart.style.display = "none";
      mikeStop.style.display = "flex";
    }
  };

  // Stop recording
  mikeStop.onclick = async function () {
    if (!room || !mikeStopFunction) return;

    if (recordingCounter <= recordingLimit) {
      clearInterval(recorderInterval);
    }

    // Say speaking stoped to room member ...
    socket.emit("room:loading:stop", room);

    if (mikeStopFunction) {
      let duration = recordingCounter;
      const res = await mikeStopFunction();
      recordingCounter = 0;
      if (typeof res === "object" && res.audioChunks && room) {
        // Send Recorded Data ...
        const id = new Date().getTime();

        makeAudioAndPush({
          code: 1,
          id,
          chuncks: res.audioChunks,
          duration,
          play: false,
        });

        socket.emit(
          "room:data:post",
          { id, room, user, audio: res.audioChunks, duration },
          (msg) => {
            const status = document.getElementById(`${id}`);
            if (status) {
              status.innerHTML = "<i class='bx bx-check-circle'></i>";
            }
          }
        );

        // recorderCounter.style.display = 'none'
        recorderCounter.innerText = 0;
        mikeStop.style.display = "none";
        mikeStart.style.display = "flex";

        mikeStopFunction = null;
      }
    }
  };

  // Initial chat request
  startChat.onclick = function (e) {
    e.target.style.opacity = ".8";
    e.target.innerText = "loading...";
    socket.emit("room:request", () => {
      searching.start();
      home.style.cssText = "display: none !important";
      chatEnv.style.cssText = "display: block";
    });
  };

  // Receive Room id from server to join in the room
  socket.on("room:id", (id) => {
    room = id;
    // join in the room ...
    socket.emit("room:join", id, (msg) => {
      mikeStart.disabled = false;
      mikeStart.style.display = "flex";
      recorderCounter.style.display = "flex";
      searching.stop();
      const message = document.createElement("div");
      message.className = "msgs-item text-success text-center";
      message.style.cssText = "font-weight: bold";
      message.innerText = msg;
      msgs.appendChild(message);
      // enabled recording buttons ...

      // popup mic start indicator ...
      const micIndicator = document.getElementById("mic-indicator");
      const micIndicatorGotIt = localStorage.getItem("mic-indicator");
      if (micIndicator && !micIndicatorGotIt) {
        micIndicator.style.display = "block";
        const gotIt = micIndicator.querySelector(".got-it");
        if (gotIt) {
          localStorage.setItem("mic-indicator", "true");
          gotIt.addEventListener("click", () => {
            micIndicator.style.display = "none";

            const logoutIndicator = document.getElementById("logout-indicator");
            const logoutIndicatorGotIt =
              localStorage.getItem("logout-indicator");
            if (logoutIndicator && !logoutIndicatorGotIt) {
              localStorage.setItem("logout-indicator", "true");
              logoutIndicator.style.display = "block";
              const gotItx = logoutIndicator.querySelector(".got-it");
              gotItx.addEventListener("click", () => {
                logoutIndicator.style.display = "none";
              });
            }
          });
        }
      }
    });
  });

  // TODO: Chat cancel
  chatCancel.onclick = async function () {
    socket.emit("room:cancel", room);
    searching.stop();
    if (mikeStopFunction) {
      await mikeStopFunction();
      mikeStopFunction = null;
      clearInterval(recorderInterval);
    }

    const message = document.createElement("div");
    message.id = "start-message";
    message.style.cssText =
      "padding: 10px; text-align: center; color: var(--bs-success);font-weight: 600;font-size: 14px; padding-top: 50px;";
    message.innerHTML = "Click below plus button to start new chat!";
    chatEnv.insertBefore(message, chatEnv.firstChild);

    recorderCounter.style.display = "none";
    recorderCounter.innerText = 0;
    mikeStop.style.display = "none";
    mikeStart.disabled = true;
    mikeStart.style.display = "none";
    chatCancel.style.display = "none";
    newChat.style.display = "flex";
  };

  // Canceled chat
  socket.on("room:canceled", async () => {
    if (room) {
      speaking.stop();
      msgs.innerHTML =
        msgs.innerHTML +
        '<div style="font-weight: 600;" class="text-danger text-center py-2 my-2">Chat Canceled.</div>';
    }
    room = null;
    if (mikeStopFunction) {
      await mikeStopFunction();
      mikeStopFunction = null;
      clearInterval(recorderInterval);
    }

    speaking.stop();
    recorderCounter.style.display = "none";
    recorderCounter.innerText = 0;
    mikeStop.style.display = "none";
    mikeStart.disabled = true;
    chatCancel.style.display = "none";
    newChat.style.display = "flex";
    mikeStart.style.display = "none";
    mikeStart.disabled = true;

    // close mic start popup
    const micIndicator = document.getElementById("mic-indicator");
    if (micIndicator) {
      micIndicator.style.display = "none";
    }
  });

  // New Chat
  let newChatClicked = false;
  newChat.onclick = function (e) {
    const startMessage = document.querySelector("#start-message");
    if (startMessage) {
      chatEnv.removeChild(startMessage);
    }

    const target = e.target;
    target.style.opacity = ".7";

    if (!newChatClicked) {
      newChatClicked = true;
      socket.emit("room:request", () => {
        newChatClicked = false;
        target.style.opacity = "1";
        msgs.innerHTML = "";
        searching.start();
        newChat.style.display = "none";
        chatCancel.style.display = "flex";
      });
    }
  };

  socket.on("room:data:get", ({ name, id, audio, duration, room }) => {
    socket.emit("room:data:received", { room, id });
    makeAudioAndPush({ code: 2, chuncks: audio, duration, play: true }); // push and auto play
    if (notifySound) {
      notifySound.play();
    }
  });

  // reached data
  socket.on("room:data:reached", (id) => {
    const status = document.getElementById(String(id));
    if (status) {
      status.innerHTML = "<i class='bx bxs-check-circle' ></i>";
    }
  });

  // TODO: Speaking start
  socket.on("room:loading:started", () => {
    speaking.start();
  });

  // TODO: Speaking stop
  socket.on("room:loading:stoped", () => {
    speaking.stop();
  });

  // TODO: Play Recording
  function makeAudioAndPush({ code, id, chuncks, duration, play }) {
    const audioBlob = new Blob(chuncks, { type: "audio/mpeg-3" });
    const audioUrl = URL.createObjectURL(audioBlob);
    const msgsItem = document.createElement("div");
    const contentBox = document.createElement("div");
    msgsItem.className = `msgs-item d-flex justify-content-${
      code == 1 ? "end theme-2" : "start theme-1"
    } align-items-center my-2 p-2`;
    contentBox.className = "content-box";
    if (id) {
      const status = document.createElement("div");
      status.className = "msg_status";
      status.id = id;
      status.innerHTML = "<i class='bx bx-circle'></i>";
      contentBox.appendChild(status);
    }
    const audio = document.createElement("audio");
    audio.style.display = "none";
    audio.src = audioUrl;
    // const audio = new Audio(audioUrl)

    makePlayer({ parent: contentBox, audio, duration }, (playBtn) => {
      msgsItem.appendChild(contentBox);
      msgs.appendChild(msgsItem);
      msgs.scrollTo(0, document.body.scrollHeight);

      if (play) {
        // first check whether other audio active
        let active = false;
        const audios = document.getElementsByTagName("audio");
        if (audios) {
          for (let i in audios) {
            if (typeof audios[i] === "object" && !audios[i].paused) {
              active = true;
              break;
            }
          }
        }

        // if any audio is not active found, then auto play
        if (!active && !mikeStopFunction) {
          playBtn.click();
        }
      }
    });
  }

  function recordAudio() {
    return new Promise((resolve) => {
      if (navigator.mediaDevices) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            // Play start sound
            if (startSound) {
              startSound.play();
            }

            const mediaRecorder = new MediaRecorder(stream);
            let audioChunks = [];

            mediaRecorder.addEventListener("dataavailable", (event) => {
              audioChunks.push(event.data);
            });

            const start = () => {
              mediaRecorder.start();
            };

            const stop = () => {
              return new Promise((resolve) => {
                mediaRecorder.addEventListener("stop", () => {
                  stream.getTracks().forEach(function (track) {
                    track.stop();
                  });

                  resolve({ audioChunks });
                });

                mediaRecorder.stop();
              });
            };

            resolve({ start, stop });
          })
          .catch((err) => {
            const modal = new xModal();
            const text = `
              <div class="text-danger" style="width: 100%">
                Please allow microphone permission of this browser to activate voice chat! And reload this page.
              </div>
            `;
            modal.on(text);
          });
      } else {
        const modal = new xModal();
        const text = `
          <div class="text-info">
            ${
              !document.location.includes("https")
                ? `<div>
                <div>Media demands secure http connection</div>
                <a href={${document.location.replace(
                  "http",
                  "https"
                )}}>Reload</a>
              <div>`
                : "Opps! Media not supported on this current browser. Please upgrade your browser."
            }
          </div>
        `;
        modal.on(text);
        window.alert("Media not supported");
        resolve(null);
      }
    });
  }

  function makePlayer({ parent, audio, duration }, next) {
    const player = document.createElement("div");
    player.className = "player";
    const playBtn = document.createElement("div");
    playBtn.className = "play icon";
    playBtn.innerHTML = "<i class='bx bx-play-circle'></i>";
    const pauseBtn = document.createElement("div");
    pauseBtn.className = "pause icon";
    pauseBtn.style.display = "none";
    pauseBtn.innerHTML = "<i class='bx bx-pause-circle'></i>";
    const range = document.createElement("div");
    range.className = "range";
    const counter = document.createElement("div");
    counter.className = "counter";
    counter.innerHTML = "00:" + `${duration > 9 ? duration : "0" + duration}`;

    player.appendChild(playBtn);
    player.appendChild(pauseBtn);
    player.appendChild(range);
    player.appendChild(counter);

    // let rangeItems = 0
    // if(duration > 50) rangeItems = duration * 40 / 100
    // else if(duration > 40) rangeItems = duration * 45 / 100
    // else if(duration > 30) rangeItems = duration * 50 / 100
    // else if(duration > 20) rangeItems = duration * 60 / 100
    // else rangeItems = duration
    // rangeItems = Math.floor(rangeItems)
    let rangeItems = 40;

    for (let i = 0; i < rangeItems; i++) {
      let item = document.createElement("div");
      item.className = "item";
      item.style.cssText = "--width: 0%;";
      item.style.height = `${Math.floor(Math.random() * (10 - 100)) + 100}%`;
      range.appendChild(item);
    }

    const itemTime = (duration * 1000) / rangeItems;
    const intervalTime = 50;
    const itemIncRate = Math.floor((intervalTime * 100) / itemTime);
    let currentTime = intervalTime;
    const items = range.children;
    let shouldClear = false;
    let interval = null;

    function clearItems(items) {
      for (let i in items) {
        if (typeof items[i] === "object") {
          let height = items[i].style["height"];
          items[i].style.cssText = "--width: 0%;";
          items[i].style.height = height;
        }
      }
    }

    function initInterval() {
      return setInterval(() => {
        let x = currentTime / itemTime;
        let position = Math.floor(x);
        let width = Math.floor((x % 1) * 100);

        let inc = itemIncRate;
        function itemUpdate() {
          const item = items[position];
          if (typeof item === "object") {
            let height = item.style["height"];
            if (width + inc < 100) {
              item.style.cssText = `--width:${width + inc}%;height:${height};`;
            } else {
              item.style.cssText = `--width:100%;height:${height};`;
              inc = width + inc - 100;
              position++;
              itemUpdate(items);
            }
          }
          const du = Math.ceil(currentTime / 1000);
          counter.innerHTML = "00:" + `${du > 9 ? du : "0" + du}`;
        }

        itemUpdate();

        currentTime += intervalTime;
      }, intervalTime);
    }

    audio.onplay = function (e) {
      // off others player ...
      const audios = document.getElementsByTagName("audio");
      if (audios) {
        for (let i in audios) {
          if (typeof audios[i] === "object" && e.target !== audios[i]) {
            audios[i].pause();
          }
        }
      }

      if (shouldClear) {
        clearItems(items);
      }

      if (!interval) {
        interval = initInterval();
      }

      playBtn.style.display = "none";
      pauseBtn.style.display = "block";
    };

    audio.onpause = function () {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      pauseBtn.style.display = "none";
      playBtn.style.display = "block";
      if (audio.ended) {
        currentTime = 0;
        shouldClear = true;
      } else {
        shouldClear = false;
      }
    };

    range.onclick = function () {
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    };

    playBtn.onclick = function () {
      audio.play();
    };

    pauseBtn.onclick = function () {
      audio.pause();
    };

    parent.appendChild(audio);
    parent.appendChild(player);

    // play notify sound
    if (notifySound) {
      notifySound.play();
    }

    next(playBtn);
  }
})();
