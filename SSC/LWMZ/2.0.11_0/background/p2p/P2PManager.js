const terminatorCharCode = '\0'.charCodeAt(0)

class P2PManager {
   constructor() {
      this.encoder = new TextEncoder() // used by Streamer classes

      this.signaler = null;
      this.channels = {}
      this.ice = null
      this.connections = {} // remotePeerId->connection

      this.streamers = {}
      this.tabStreamers = {}
      this.closeTimeouts = {} // channel->timeoutId

      this.disconnect = this.disconnect.bind(this)
   }

   receiveDataChannel = (event, peerConnection, remotePeerId) => {
      let channel = event.channel
      let channelLabel = event.channel.label;

      if (channelLabel === "main") {
         this.streamers[remotePeerId] = new SnapshotStreamer(channel, peerConnection.pc.sctp.maxMessageSize);
         this.streamers[remotePeerId].startStreaming();
      }

      if (channelLabel === "control") {
         event.channel.addEventListener('message', (ev) => {
            const message = JSON.parse(ev.data);
            
            let windowId = message["windowId"];
            let tabId = message["tabId"];

            if (this.streamers[remotePeerId]) this.streamers[remotePeerId].switchTab(tabId, windowId);
            if (this.tabStreamers[remotePeerId]) this.tabStreamers[remotePeerId].setWindow(windowId);
         });
         this.tabStreamers[remotePeerId] = new TabStreamer(channel, peerConnection.pc.sctp.maxMessageSize);
         this.tabStreamers[remotePeerId].startStreaming();
      }

      event.channel.addEventListener('close', () => {
         if (channelLabel === "main" && this.streamers[remotePeerId]) {
            this.streamers[remotePeerId].endStreaming();
            delete this.streamers[remotePeerId];
         }
         if (channelLabel === "control" && this.tabStreamers[remotePeerId]) {
            this.tabStreamers[remotePeerId].endStreaming();
            delete this.tabStreamers[remotePeerId];
         }
         this.disconnect(remotePeerId);
         this.closeChannelsWithPeer(remotePeerId);
      });
   }


   initSignaler(signalToken, channelName, remotePeerId) {
      const peerId = config.getCurrentUserInfo().user + "_peerAgentId_" + config.chromeId;

      // open the signaler realtime client if we are not currently connected.
      if (!this.signaler || this.signaler.client.connection.state === 'closed') {
         this.signaler = new P2PUtils.Signaler(signalToken);
         this.signaler.client.connect();

         this.signaler.client.connection.once('closed', event => {
            this.channels = {}
            this.signaler = null;
         })

         this.signaler.client.connection.on('failed', err => {
            // this may happen when the signaler token expires in which case we will
            // just recreate it when the next connection attempt occurs
            this.channels = {}
            this.signaler = null
            console.error('signaler error', err)
         })
      }

      const channel = this.signaler.channel(channelName)
      channel.presence.enter()
      this.channels[remotePeerId] = channelName

      channel.subscribe(P2PUtils.P2P_CONNECT_MESSAGE, message => {
         const data = message.data

         if (data.receiver !== peerId) {
            return;
         }
         
         const remotePeerId = getMessageSender(message)
         const peerConnection = this.connect(channel, remotePeerId, message)
         peerConnection.pc.addEventListener('datachannel', (event) => this.receiveDataChannel(event, peerConnection, remotePeerId))
      })

      channel.subscribe('disconnect', message => {
         if (message.received !== peerId) return;
         const remotePeerId = getMessageSender(message)
         this.disconnect(remotePeerId);
         this.closeChannelsWithPeer(remotePeerId);
      })
   }

   setIce(ice) {
      this.ice = ice
   }

   connect(signaler, remotePeerId, connectMsg) {
      if (this.connections[remotePeerId]) {
         this.disconnect(remotePeerId)
      }

      const peerConnection = new P2PUtils.PeerConnection(signaler, this.ice, true)
      peerConnection.connect(remotePeerId, connectMsg)
      this.connections[remotePeerId] = peerConnection

      return peerConnection
   }

   close = (channel) => {
      for (const [key, value] of Object.entries(this.channels)) {
         if (value === channel) {
            this.closeChannelsWithPeer(key);  
         }
      }
   }

   disconnect(remotePeerId) {
      if (this.connections[remotePeerId]) {
         this.connections[remotePeerId].close()
         delete this.connections[remotePeerId]
      }
   }

   closeChannelsWithPeer(remotePeerId) {
      if (this.channels[remotePeerId]) {
         const channel = this.signaler.channel(this.channels[remotePeerId])
         channel.unsubscribe()
         channel.detach()
         delete this.channels[remotePeerId]
      }

      if (Object.keys(this.channels).length === 0 && this.signaler && this.signaler.client.connection.state === 'connected') {
         this.signaler.client.close()
      }
   }

   setCloseTimeouts(config) {
      const deviceChannelId = config.device_id.replace(/[^a-z0-9]/gi, '-');

      for (const classroomConfig of config.active_configurations) {
         const classroomEndUnix = configEndUnix(classroomConfig);

         if (classroomEndUnix > Date.now() / 1000) {
            const classroomChannelId = classroomConfig.group.replace(/[^a-z0-9]/gi, '-');
            const channel = `${deviceChannelId}/${classroomChannelId}`;

            clearTimeout(this.closeTimeouts[channel])
            this.closeTimeouts[channel] = setTimeout(() => {
               this.close(channel);
            }, classroomEndUnix * 1000 - Date.now())
         }
      }
   }
}

function getMessageSender(msg) {
   return msg.clientId
}

function tobin(msg) {
   const buf = new Uint8Array(msg.length)
   for (let i = 0; i < msg.length; i++) {
      buf[i] = msg[i].charCodeAt(0)
   }

   return buf
}

function prepareMessage(obj) {
   obj["timestamp"] = new Date().getTime()
   const msg = JSON.stringify(obj)
   const bin = new Uint8Array([...p2pManager.encoder.encode(msg), terminatorCharCode, terminatorCharCode]);
   return bin;
}

function send(channel, bin, maxMessageSize) {
   let index = 0;
   while (index < bin.length) {
      const nextMessageSize = Math.min(maxMessageSize, bin.length - index)
      const next = new Uint8Array(bin.buffer, index, nextMessageSize)
      channel.send(next)
      index += nextMessageSize
   }
}
