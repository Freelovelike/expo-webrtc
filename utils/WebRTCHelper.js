import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
} from "react-native-webrtc";

class WebRTCHelper {
  constructor(config) {
    // ICE服务器配置
    this.configuration = {
      iceServers: [
        // {
        //   urls: [
        //     "stun:stun.l.google.com:19302",
        //     "stun:stun1.l.google.com:19302",
        //     "stun:stun2.l.google.com:19302",
        //     "stun:stun3.l.google.com:19302",
        //     "stun:stun4.l.google.com:19302"
        //   ]
        // },
        // 添加TURN服务器配置
        // {
        //   urls: "turn:119.29.188.102:3478?transport=udp",
        //   username: "wladmin",
        //   credential: "wladminpass"
        // }
        // {
        //   urls: "turn:global.relay.metered.ca:80",
        //   username: "b48f1b1a568960086738f57b",
        //   credential: "qZXl4gi5lrxlhwwV",
        // },
        // {
        //   urls: "turn:global.relay.metered.ca:443",
        //   username: "b48f1b1a568960086738f57b",
        //   credential: "qZXl4gi5lrxlhwwV",
        // },
        // {
        //   urls: "turns:global.relay.metered.ca:443?transport=tcp",
        //   username: "b48f1b1a568960086738f57b",
        //   credential: "qZXl4gi5lrxlhwwV",
        // }
        {
          urls: [
            "turn:114.132.223.74:3478?transport=udp",
            "turn:114.132.223.74:3478?transport=tcp",
          ],
          username: "wladmin",
          credential: "wladminpass"
        },
      ],
      // iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all', // 允许所有传输策略
      bundlePolicy: 'max-bundle', // 使用最大捆绑策略
      rtcpMuxPolicy: 'require', // 要求RTCP多路复用
      ...config, // 合并传入的配置
    };

    this.peerConnection = null;
    this.isInitiator = false; // 默认不是发起者
    this.onNegotiationNeeded = null; // 协商回调函数
    this.isNegotiating = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }


  // 初始化对等连接
  initPeerConnection(
    onIceCandidate,
    onTrack,
    onConnectionStateChange,
    onNegotiationNeeded
  ) {
    try {
      this.peerConnection = new RTCPeerConnection(this.configuration);
      console.log("初始化对等连接", this.peerConnection);

      // 如果提供了协商回调，则设置
      if (onNegotiationNeeded) {
        this.onNegotiationNeeded = onNegotiationNeeded;
      }

      // 监听ICE候选信息
      this.peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
          console.log(
            "新的ICE候选:",
            candidate.candidate.substr(0, 50) + "..."
          );
          onIceCandidate(candidate);
        } else {
          console.log("ICE候选收集完成");
        }
      };

      // 监听远端流
      this.peerConnection.ontrack = (event) => {
        console.log("收到远程轨道:", event.track.kind);
        if (event.streams && event.streams[0]) {
          onTrack(event.streams[0]);
        }
      };

      // 监听连接状态变化并添加重连逻辑
      this.peerConnection.oniceconnectionstatechange = () => {
        if (!this.peerConnection) return; // 添加空检查
        
        const state = this.peerConnection.iceConnectionState;
        console.log("ICE连接状态变化:", state);
        
        if (state === 'disconnected' || state === 'failed') {
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            console.log(`尝试重新连接 (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
            this.reconnectAttempts++;
            
            // 重新协商连接
            if (this.isInitiator && !this.isNegotiating) {
              this.handleNegotiationNeeded();
            }
          } else {
            console.log("达到最大重连次数，停止重连");
            this.reconnectAttempts = 0;
          }
        } else if (state === 'connected' || state === 'completed') {
          this.reconnectAttempts = 0;
        }
        
        onConnectionStateChange && onConnectionStateChange(state);
      };

      // 监听数据通道
      this.peerConnection.ondatachannel = (event) => {
        console.log("数据通道已创建");
      };

      // 监听信令状态变化
      this.peerConnection.onsignalingstatechange = () => {
        if (!this.peerConnection) return; // 添加空检查
        console.log("信令状态变化:", this.peerConnection.signalingState);
      };

      // 监听ICE连接状态变化
      this.peerConnection.onicegatheringstatechange = () => {
        if (!this.peerConnection) return; // 添加空检查
        console.log("ICE收集状态变化:", this.peerConnection.iceGatheringState);
      };

      // 监听连接状态变化
      this.peerConnection.onconnectionstatechange = () => {
        if (!this.peerConnection) return; // 添加空检查
        console.log("连接状态变化:", this.peerConnection.connectionState);
      };

      // 添加防抖标记，避免短时间内触发多次协商
      this.isNegotiating = false;

      // 监听需要协商事件
      this.peerConnection.onnegotiationneeded = async (event) => {
        console.log("需要重新协商");
        
        // 如果已经在协商中，则跳过
        if (this.isNegotiating) {
          console.log("已经在协商中，跳过当前协商请求");
          return;
        }
        
        // 如果不是发起者，则跳过
        if (!this.isInitiator) {
          console.log("非发起者，跳过协商");
          return;
        }
        
        // 检查连接状态
        if (this.peerConnection.signalingState !== "stable") {
          console.log("信令状态不是stable，跳过创建提议");
          return;
        }
        
        try {
          this.isNegotiating = true;
          await this.handleNegotiationNeeded();
        } catch (error) {
          console.error("处理重新协商失败:", error);
        } finally {
          // 在信令状态回到stable时重置协商标记
          const checkSignalingState = () => {
            if (this.peerConnection && this.peerConnection.signalingState === "stable") {
              this.isNegotiating = false;
              this.peerConnection.removeEventListener("signalingstatechange", checkSignalingState);
            }
          };
          
          this.peerConnection.addEventListener("signalingstatechange", checkSignalingState);
          
          // 确保超时后也重置标记，防止协商卡死
          setTimeout(() => {
            this.isNegotiating = false;
          }, 10000);
        }
      };

      return true;
    } catch (error) {
      console.error("初始化对等连接失败:", error);
      return false;
    }
  }

  // 添加本地流到对等连接
  addLocalStream(localStream) {
    if (!this.peerConnection) return;

    // 添加前先检查轨道格式是否支持
    const audioTracks = localStream.getAudioTracks();
    const videoTracks = localStream.getVideoTracks();
    
    if (audioTracks.length > 0) {
      try {
        console.log("添加音频轨道:", audioTracks[0].label);
        this.peerConnection.addTrack(audioTracks[0], localStream);
      } catch (error) {
        console.warn("添加音频轨道失败:", error);
      }
    }
    
    if (videoTracks.length > 0) {
      try {
        console.log("添加视频轨道:", videoTracks[0].label);
        this.peerConnection.addTrack(videoTracks[0], localStream);
      } catch (error) {
        console.warn("添加视频轨道失败:", error);
      }
    }
  }

  // 创建提议(SDP)
  async createOffer() {
    try {
      if (!this.peerConnection) {
        console.error("无法创建提议：PeerConnection未初始化");
        return null;
      }

      // 检查当前信令状态是否适合创建提议
      if (this.peerConnection.signalingState !== "stable") {
        console.warn(
          "创建提议时信令状态不是stable:",
          this.peerConnection.signalingState
        );
        // 可以选择等待状态变为stable，或尝试回滚
      }

      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      };

      console.log("开始创建提议...");
      const offer = await this.peerConnection.createOffer(offerOptions);
      console.log("提议创建成功，设置本地描述...");
      await this.peerConnection.setLocalDescription(offer);
      console.log(
        "本地描述已设置，当前信令状态:",
        this.peerConnection.signalingState
      );
      return offer;
    } catch (error) {
      console.error("创建提议错误:", error);
      return null;
    }
  }

  // 创建应答(SDP)
  async createAnswer() {
    try {
      if (!this.peerConnection) {
        console.error("无法创建应答：PeerConnection未初始化");
        return null;
      }

      // 检查当前信令状态是否适合创建应答
      if (
        this.peerConnection.signalingState !== "have-remote-offer" &&
        this.peerConnection.signalingState !== "have-local-pranswer"
      ) {
        console.warn(
          "创建应答时信令状态不正确:",
          this.peerConnection.signalingState
        );
        // 如果状态不对，可能需要先处理远程描述
      }

      console.log("开始创建应答...");
      const answer = await this.peerConnection.createAnswer();
      console.log("应答创建成功，设置本地描述...");
      await this.peerConnection.setLocalDescription(answer);
      console.log(
        "本地描述已设置，当前信令状态:",
        this.peerConnection.signalingState
      );
      return answer;
    } catch (error) {
      console.error("创建应答错误:", error);
      return null;
    }
  }

  // 设置远端描述(SDP)
  async setRemoteDescription(sdp) {
    try {
      if (!this.peerConnection) {
        console.error("无法设置远程描述：PeerConnection未初始化");
        return false;
      }

      // 添加信令状态检查
      const currentState = this.peerConnection.signalingState;
      console.log("设置远程描述前的信令状态:", currentState);

      // 如果是answer类型且当前已经是stable状态，则忽略
      if (sdp.type === "answer" && currentState === "stable") {
        console.log("忽略answer，因为信令状态已经是stable");
        return true;
      }

      // 如果是offer类型且当前不是stable状态，需要小心处理
      if (sdp.type === "offer" && currentState !== "stable") {
        console.log("警告：在非stable状态下收到offer，当前状态:", currentState);
        // 对于远程offer，尝试回滚本地描述
        if (this.peerConnection.signalingState === "have-local-offer") {
          try {
            console.log("尝试回滚本地描述以接受新的offer");
            await this.peerConnection.setLocalDescription({type: "rollback"});
            console.log("本地描述回滚成功");
          } catch (rollbackError) {
            console.error("本地描述回滚失败:", rollbackError);
          }
        }
      }

      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(sdp)
      );
      console.log(
        "设置远程描述后的信令状态:",
        this.peerConnection.signalingState
      );
      return true;
    } catch (error) {
      console.error("设置远端描述错误:", error);
      return false;
    }
  }

  // 添加ICE候选信息
  async addIceCandidate(candidate) {
    try {
      if (!this.peerConnection) {
        console.error("无法添加ICE候选：PeerConnection未初始化");
        return false;
      }

      // 确保远程描述已设置
      if (this.peerConnection.remoteDescription === null) {
        console.log("远程描述未设置，暂存ICE候选");
        // 这里可以选择缓存候选信息，等远程描述设置后再添加
        return false;
      }

      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      return true;
    } catch (error) {
      console.error("添加ICE候选信息错误:", error);
      // 忽略错误，因为某些候选信息可能在远程描述设置前到达
      return false;
    }
  }

  // 切换本地流（用于切换摄像头等）
  async switchStream(newLocalStream) {
    if (!this.peerConnection) return;

    const senders = this.peerConnection.getSenders();

    const videoTrack = newLocalStream.getVideoTracks()[0];
    const audioTrack = newLocalStream.getAudioTracks()[0];

    senders.forEach((sender) => {
      if (sender.track && sender.track.kind === "video" && videoTrack) {
        sender.replaceTrack(videoTrack);
      }
      if (sender.track && sender.track.kind === "audio" && audioTrack) {
        sender.replaceTrack(audioTrack);
      }
    });
  }

  // 创建并发送应答
  async sendAnswer(socket, targetUserId) {
    try {
      console.log('创建应答...');
      const answer = await this.createAnswer();
      if (!answer) {
        console.error('创建应答失败');
        return false;
      }
      
      console.log('发送应答到发起方');
      socket.emit('rtc-answer', {
        callerId: targetUserId,
        answer
      });
      return true;
    } catch (error) {
      console.error('发送应答失败:', error);
      return false;
    }
  }

  // 关闭连接
  close() {
    if (this.peerConnection) {
      try {
        // 移除所有轨道
        const senders = this.peerConnection.getSenders();
        senders.forEach(sender => {
          try {
            this.peerConnection.removeTrack(sender);
          } catch (e) {
            console.warn('移除轨道失败:', e);
          }
        });

        // 关闭连接前记录最后的状态
        const lastIceState = this.peerConnection.iceConnectionState;
        const lastConnState = this.peerConnection.connectionState;
        
        // 关闭连接
        this.peerConnection.close();
        
        // 手动触发最后的状态变化事件
        console.log("连接已关闭");
        console.log("最后的ICE连接状态:", lastIceState);
        console.log("最后的连接状态:", lastConnState);
        
        // 清理所有事件监听器
        this.peerConnection.oniceconnectionstatechange = null;
        this.peerConnection.onsignalingstatechange = null;
        this.peerConnection.onicegatheringstatechange = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.onicecandidate = null;
        this.peerConnection.ontrack = null;
        this.peerConnection.ondatachannel = null;
        this.peerConnection.onnegotiationneeded = null;
        
        // 最后才设置为null
        this.peerConnection = null;
      } catch (error) {
        console.error("关闭WebRTC连接时出错:", error);
      }
    }
  }

  // 处理重新协商需求
  async handleNegotiationNeeded() {
    try {
      if (!this.peerConnection) {
        console.error("无法进行重新协商：PeerConnection未初始化");
        return false;
      }
      
      // 检查连接状态
      if (this.peerConnection.signalingState !== "stable") {
        console.log("信令状态不稳定，等待状态变为stable后再协商");
        return false;
      }
      
      console.log("开始重新协商过程");
      
      // 创建新的offer
      const offer = await this.createOffer();
      if (!offer) {
        console.error("重新协商过程中创建offer失败");
        return false;
      }
      
      // 通知应用层需要发送新的offer到远端
      if (this.onNegotiationNeeded) {
        console.log("需要重新协商，发送新的offer");
        this.onNegotiationNeeded(offer);
        return true;
      } else {
        console.warn("未设置onNegotiationNeeded回调，无法发送offer到远端");
        return false;
      }
    } catch (error) {
      console.error("重新协商过程中出错:", error);
      return false;
    }
  }

  // 设置协商回调
  setNegotiationCallback(callback) {
    this.onNegotiationNeeded = callback;
  }

  // 设置发起者角色
  setInitiator(isInitiator) {
    this.isInitiator = !!isInitiator;
  }
}

export default WebRTCHelper;

/* 使用示例：

// 初始化WebRTC辅助类
const webrtcHelper = new WebRTCHelper();

// 设置为发起者角色（通常在创建房间或发起呼叫的一方设置）
webrtcHelper.setInitiator(true);

// 初始化对等连接，包括处理协商需求的回调
webrtcHelper.initPeerConnection(
  // ICE候选处理
  (candidate) => {
    // 通过信令服务器将ICE候选发送给对方
    signalingChannel.send({ type: 'ice-candidate', candidate });
  },
  // 远端流处理
  (stream) => {
    // 显示远端视频/音频
    remoteVideoRef.current.srcObject = stream;
  },
  // 连接状态变化处理
  (state) => {
    console.log('连接状态变化:', state);
  },
  // 协商需求处理
  (offer) => {
    // 通过信令服务器将新的offer发送给对方
    signalingChannel.send({ type: 'offer', sdp: offer });
  }
);

// 或者可以单独设置协商回调
webrtcHelper.setNegotiationCallback((offer) => {
  signalingChannel.send({ type: 'offer', sdp: offer });
});

// 当添加或移除媒体轨道时，可能会触发onnegotiationneeded事件
localStream.getTracks().forEach(track => {
  webrtcHelper.peerConnection.addTrack(track, localStream);
});

// 当对方收到offer后，需要创建应答并发送回去
signalingChannel.on('offer', async (data) => {
  await webrtcHelper.setRemoteDescription(data.sdp);
  const answer = await webrtcHelper.createAnswer();
  signalingChannel.send({ type: 'answer', sdp: answer });
});

// 当原始发起方收到answer后，设置远程描述完成协商
signalingChannel.on('answer', async (data) => {
  await webrtcHelper.setRemoteDescription(data.sdp);
});

// ICE候选的处理
signalingChannel.on('ice-candidate', async (data) => {
  await webrtcHelper.addIceCandidate(data.candidate);
});
*/
