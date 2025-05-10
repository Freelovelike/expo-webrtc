import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc';

class WebRTCHelper {
  constructor(config) {
    // ICE服务器配置
    this.configuration = {
      iceServers: [
        {
          urls: 'turn:freelike.cn:3478',
          username: 'freelove',
          credential: 'hwc20010106'
        }
      ],
      iceCandidatePoolSize: 10,
      ...config // 合并传入的配置
    };
    
    this.peerConnection = null;
  }

  // 初始化对等连接
  initPeerConnection(onIceCandidate, onTrack, onConnectionStateChange) {
    try {
      this.peerConnection = new RTCPeerConnection(this.configuration);
      console.log('初始化对等连接',this.peerConnection);
      // 监听ICE候选信息
      this.peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
          console.log('新的ICE候选:', candidate.candidate.substr(0, 50) + '...');
          onIceCandidate(candidate);
        } else {
          console.log('ICE候选收集完成');
        }
      };
      
      // 监听远端流
      this.peerConnection.ontrack = (event) => {
        console.log('收到远程轨道:', event.track.kind);
        if (event.streams && event.streams[0]) {
          onTrack(event.streams[0]);
        }
      };
      
      // 监听连接状态变化
      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection.iceConnectionState;
        console.log('ICE连接状态变化:', state);
        onConnectionStateChange(state);
      };

      // 监听数据通道
      this.peerConnection.ondatachannel = (event) => {
        console.log('数据通道已创建');
      };

      // 监听信令状态变化
      this.peerConnection.onsignalingstatechange = () => {
        console.log('信令状态变化:', this.peerConnection.signalingState);
      };

      // 监听ICE连接状态变化
      this.peerConnection.onicegatheringstatechange = () => {
        console.log('ICE收集状态变化:', this.peerConnection.iceGatheringState);
      };
      
      // 监听连接状态变化
      this.peerConnection.onconnectionstatechange = () => {
        console.log('连接状态变化:', this.peerConnection.connectionState);
      };
      
      // 监听需要协商事件
      this.peerConnection.onnegotiationneeded = (event) => {
        console.log('需要重新协商');
      };

      return true;
    } catch (error) {
      console.error('初始化对等连接失败:', error);
      return false;
    }
  }

  // 添加本地流到对等连接
  addLocalStream(localStream) {
    if (!this.peerConnection) return;

    localStream.getTracks().forEach((track) => {
      this.peerConnection.addTrack(track, localStream);
    });
  }

  // 创建提议(SDP)
  async createOffer() {
    if (!this.peerConnection) throw new Error('PeerConnection未初始化');
    
    try {
      // 检查当前信令状态是否适合创建提议
      if (this.peerConnection.signalingState !== 'stable') {
        console.warn('创建提议时信令状态不是stable:', this.peerConnection.signalingState);
        // 可以选择等待状态变为stable，或尝试回滚
      }
      
      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      };
      
      console.log('开始创建提议...');
      const offer = await this.peerConnection.createOffer(offerOptions);
      console.log('提议创建成功，设置本地描述...');
      await this.peerConnection.setLocalDescription(offer);
      console.log('本地描述已设置，当前信令状态:', this.peerConnection.signalingState);
      return offer;
    } catch (error) {
      console.error('创建提议错误:', error);
      throw error;
    }
  }

  // 创建应答(SDP)
  async createAnswer() {
    if (!this.peerConnection) throw new Error('PeerConnection未初始化');
    
    try {
      // 检查当前信令状态是否适合创建应答
      if (this.peerConnection.signalingState !== 'have-remote-offer' && 
          this.peerConnection.signalingState !== 'have-local-pranswer') {
        console.warn('创建应答时信令状态不正确:', this.peerConnection.signalingState);
        // 如果状态不对，可能需要先处理远程描述
      }
      
      console.log('开始创建应答...');
      const answer = await this.peerConnection.createAnswer();
      console.log('应答创建成功，设置本地描述...');
      await this.peerConnection.setLocalDescription(answer);
      console.log('本地描述已设置，当前信令状态:', this.peerConnection.signalingState);
      return answer;
    } catch (error) {
      console.error('创建应答错误:', error);
      throw error;
    }
  }

  // 设置远端描述(SDP)
  async setRemoteDescription(sdp) {
    if (!this.peerConnection) throw new Error('PeerConnection未初始化');
    
    try {
      // 添加信令状态检查
      const currentState = this.peerConnection.signalingState;
      console.log('设置远程描述前的信令状态:', currentState);
      
      // 如果是answer类型且当前已经是stable状态，则忽略
      if (sdp.type === 'answer' && currentState === 'stable') {
        console.log('忽略answer，因为信令状态已经是stable');
        return;
      }
      
      // 如果是offer类型且当前不是stable状态，需要小心处理
      if (sdp.type === 'offer' && currentState !== 'stable') {
        console.log('警告：在非stable状态下收到offer，当前状态:', currentState);
        // 可以选择回滚或其他策略
      }
      
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('设置远程描述后的信令状态:', this.peerConnection.signalingState);
    } catch (error) {
      console.error('设置远端描述错误:', error);
      throw error;
    }
  }

  // 添加ICE候选信息
  async addIceCandidate(candidate) {
    if (!this.peerConnection) throw new Error('PeerConnection未初始化');
    
    try {
      // 确保远程描述已设置
      if (this.peerConnection.remoteDescription === null) {
        console.log('远程描述未设置，暂存ICE候选');
        // 这里可以选择缓存候选信息，等远程描述设置后再添加
        return;
      }
      
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('添加ICE候选信息错误:', error);
      // 忽略错误，因为某些候选信息可能在远程描述设置前到达
    }
  }

  // 切换本地流（用于切换摄像头等）
  async switchStream(newLocalStream) {
    if (!this.peerConnection) return;
    
    const senders = this.peerConnection.getSenders();
    
    const videoTrack = newLocalStream.getVideoTracks()[0];
    const audioTrack = newLocalStream.getAudioTracks()[0];
    
    senders.forEach((sender) => {
      if (sender.track && sender.track.kind === 'video' && videoTrack) {
        sender.replaceTrack(videoTrack);
      }
      if (sender.track && sender.track.kind === 'audio' && audioTrack) {
        sender.replaceTrack(audioTrack);
      }
    });
  }

  // 关闭连接
  close() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}

export default WebRTCHelper; 