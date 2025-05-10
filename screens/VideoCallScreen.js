import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Alert,
  Platform,
  SafeAreaView,
  PanResponder
} from 'react-native';
import {
  RTCView,
  mediaDevices
} from 'react-native-webrtc';
import { Audio } from 'expo-av';

import WebRTCHelper from '../utils/WebRTCHelper';
const { width, height } = Dimensions.get('window');

const VideoCallScreen = ({ route, navigation, socket, user }) => {
  const { targetUser, mode, isHost } = route.params;
  
  // 状态变量
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(mode === 'video');
  const [callStatus, setCallStatus] = useState(isHost ? 'calling' : 'receiving');
  const [callTimer, setCallTimer] = useState(0);
  const [isEarpiece, setIsEarpiece] = useState(false);
  
  // 本地视图位置
  const [localViewPosition, setLocalViewPosition] = useState({ x: 20, y: 50 });
  
  // WebRTC 帮助类实例
  const webrtcHelperRef = useRef(null);
  
  // 计时器引用
  const timerRef = useRef(null);
  
  // 音频引用
  const callSoundRef = useRef(null);
  const endCallSoundRef = useRef(null);
  
  // 创建拖动响应器
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        setLocalViewPosition({
          x: Math.max(0, Math.min(width - 120, localViewPosition.x + gestureState.dx)),
          y: Math.max(50, Math.min(height - 230, localViewPosition.y + gestureState.dy)),
        });
      },
      onPanResponderRelease: () => {
        // 拖动结束，不需要额外操作
      },
    })
  ).current;
  
  // 初始化
  useEffect(() => {
    // 创建 WebRTC 实例，传入配置
    const config = {
      iceServers: [
        {
          urls: "stun:stun.relay.metered.ca:80",
        },
        {
          urls: "turn:global.relay.metered.ca:80",
          username: "b48f1b1a568960086738f57b",
          credential: "qZXl4gi5lrxlhwwV",
        },
        {
          urls: "turn:global.relay.metered.ca:80?transport=tcp",
          username: "b48f1b1a568960086738f57b",
          credential: "qZXl4gi5lrxlhwwV",
        },
        {
          urls: "turn:global.relay.metered.ca:443",
          username: "b48f1b1a568960086738f57b",
          credential: "qZXl4gi5lrxlhwwV",
        },
        {
          urls: "turns:global.relay.metered.ca:443?transport=tcp",
          username: "b48f1b1a568960086738f57b",
          credential: "qZXl4gi5lrxlhwwV",
        },
    ],
      iceCandidatePoolSize: 10
    };
    webrtcHelperRef.current = new WebRTCHelper(config);
    
    // 加载音频
    loadSounds();
    
    // 初始化媒体设备
    setupMediaStream();
    
    // 设置socket监听
    setupSocketListeners();
    
    // 开始通话计时
    startCallTimer();
    
    return () => {
      // 清理资源
      cleanUp();
    };
  }, []);
  
  // 初始化音频
  const loadSounds = async () => {
    try {
      // 呼叫音频
      const { sound: callSound } = await Audio.Sound.createAsync(
        require('../assets/call.mp3')  // 请确保在 assets 目录下有这个文件
      );
      callSoundRef.current = callSound;
      
      // 结束通话音频
      const { sound: endCallSound } = await Audio.Sound.createAsync(
        require('../assets/hangup.mp3')  // 请确保在 assets 目录下有这个文件
      );
      endCallSoundRef.current = endCallSound;
      
      // 如果是呼叫方，播放呼叫音效
      if (isHost && callStatus === 'calling') {
        await callSoundRef.current.setIsLoopingAsync(true);
        await callSoundRef.current.playAsync();
      }
    } catch (error) {
      console.log('加载音频失败:', error);
    }
  };
  
  // 设置媒体流
  const setupMediaStream = async () => {
    try {
      const constraints = {
        audio: true,
        video: mode === 'video' ? {
          facingMode: isFrontCamera ? 'user' : 'environment',
          width: 1280,
          height: 720
        } : false
      };
      
      const stream = await mediaDevices.getUserMedia(constraints);
      console.log('获取到本地媒体流，音轨数:', stream.getAudioTracks().length, 
                  '视轨数:', stream.getVideoTracks().length);
      
      setLocalStream(stream);
      
      // 初始化WebRTC连接
      const success = setupWebRTC(stream);
      
      if (!success) {
        throw new Error('WebRTC连接设置失败');
      }
      
      // 如果是主持人，创建提议
      if (isHost) {
        setCallStatus('calling');
      } else {
        setCallStatus('receiving');
      }
      
      return true;
    } catch (error) {
      console.error('获取媒体流失败:', error);
      Alert.alert('错误', '无法访问摄像头或麦克风，请检查权限设置');
      navigation.goBack();
      return false;
    }
  };

  // 设置WebRTC连接
  const setupWebRTC = (stream) => {
    if (!stream) {
      console.error('无法设置WebRTC连接: 媒体流不可用');
      return false;
    }
    
    const webrtcHelper = webrtcHelperRef.current;
    
    try {
      // 确保先关闭任何现有连接
      if (webrtcHelper.peerConnection) {
        webrtcHelper.close();
      }
      
      const success = webrtcHelper.initPeerConnection(
        // ICE候选处理
        (candidate) => {
          socket.emit('rtc-candidate', {
            targetUserId: targetUser.id,
            candidate
          });
        },
        // 远程流处理
        (remoteMediaStream) => {
          console.log('收到远程媒体流');
          setRemoteStream(remoteMediaStream);
          
          // 停止呼叫音效，开始计时
          if (callSoundRef.current) {
            callSoundRef.current.stopAsync();
          }
          setCallStatus('connected');
        },
        // 连接状态变化处理
        (state) => {
          console.log('ICE连接状态:', state);
          if (state === 'disconnected' || state === 'failed' || state === 'closed') {
            setCallStatus('disconnected');
          } else if (state === 'connected') {
            setCallStatus('connected');
          }
        },
        // 协商需求处理
        (offer) => {
          console.log('需要重新协商，发送新的offer');
          socket.emit('rtc-offer', {
            targetUserId: targetUser.id,
            offer
          });
        }
      );

      if (!success) {
        throw new Error('初始化对等连接失败');
      }
      
      // 设置发起者角色
      webrtcHelper.setInitiator(isHost);
      
      // 添加本地流到连接
      webrtcHelper.addLocalStream(stream);
      
      return true;
    } catch (error) {
      console.error('设置WebRTC连接失败:', error);
      if (error.message && error.message.includes('getAudioTracks')) {
        console.log('错误与媒体轨道相关，可能是媒体流问题');
      }
      return false;
    }
  };
  
  // 设置Socket监听器
  const setupSocketListeners = () => {
    // 监听提议
    socket.on('rtc-offer', async ({ callerId, offer }) => {
      try {
        if (callerId === targetUser.id && !isHost) {
          console.log('收到提议，准备创建应答');
          const webrtcHelper = webrtcHelperRef.current;
          
          // 如果连接状态不对，先重置连接
          if (webrtcHelper.peerConnection && webrtcHelper.peerConnection.signalingState !== 'stable') {
            console.log('重置连接以接收新offer');
            webrtcHelper.close();
            
            // 检查本地流是否可用
            if (!localStream) {
              console.log('本地流不可用，重新获取媒体流');
              await setupMediaStream();
              
              // 重新发起处理offer流程
              if (webrtcHelper.peerConnection) {
                // 设置远程描述
                const setDescResult = await webrtcHelper.setRemoteDescription(offer);
                if (!setDescResult) {
                  console.error('设置远程描述失败');
                  return;
                }
                
                // 创建应答并发送
                await sendAnswer(webrtcHelper);
              }
              return;
            }
            
            // 重新初始化连接
            if (!setupWebRTC(localStream)) {
              console.error('重新初始化连接失败');
              return;
            }
            
            // 给一点时间让连接初始化
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // 确保连接已初始化
          if (!webrtcHelper.peerConnection) {
            console.error('PeerConnection未初始化，无法处理offer');
            return;
          }
          
          // 设置远程描述
          const setDescResult = await webrtcHelper.setRemoteDescription(offer);
          if (!setDescResult) {
            console.error('设置远程描述失败');
            return;
          }
          
          // 等待一小段时间，让ICE收集开始
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 创建应答并发送
          await sendAnswer(webrtcHelper);
        }
      } catch (error) {
        console.error('处理提议错误:', error);
      }
    });
    
    // 添加呼叫请求处理
    socket.on('rtc-call-request', ({ callerId, callType }) => {
      if (callerId === targetUser.id && !isHost) {
        console.log('收到呼叫请求，准备接受');
        // 这里可以显示UI让用户决定是否接受
        // 现在我们自动接受
        socket.emit('rtc-accept', { callerId: targetUser.id });
      }
    });
    
    // 监听应答
    socket.on('rtc-answer', async ({ calleeId, answer }) => {
      try {
        if (calleeId === targetUser.id && isHost) {
          const webrtcHelper = webrtcHelperRef.current;
          // 添加信令状态检查，只在非stable状态时设置远程描述
          if (webrtcHelper.peerConnection && webrtcHelper.peerConnection.signalingState !== 'stable') {
            console.log('设置远程描述，当前信令状态:', webrtcHelper.peerConnection.signalingState);
            const result = await webrtcHelper.setRemoteDescription(answer);
            if (!result) {
              console.error('设置远程描述失败');
            }
          } else {
            console.log('忽略应答，当前信令状态已是stable');
          }
        }
      } catch (error) {
        console.error('处理应答错误:', error);
      }
    });

    // 监听接受呼叫
    socket.on('rtc-accept', async ({ calleeId }) => {
      try {
        if (calleeId === targetUser.id && isHost) {
          console.log('对方接受了通话请求');
          
          // 停止呼叫音效
          if (callSoundRef.current) {
            callSoundRef.current.stopAsync();
          }
          
          // 创建并发送提议
          const webrtcHelper = webrtcHelperRef.current;
          
          // 无论信令状态如何，都尝试发起新提议
          webrtcHelper.setInitiator(true); // 确保设置为发起者
          
          // 先关闭可能存在的连接
          if (webrtcHelper.peerConnection && webrtcHelper.peerConnection.signalingState !== 'stable') {
            console.log('重置连接以创建新的offer');
            webrtcHelper.close();
            
            // 检查本地流是否可用
            if (!localStream) {
              console.log('本地流不可用，重新获取媒体流');
              await setupMediaStream();
              return; // 媒体流初始化会重新建立连接
            }
            
            // 重新初始化连接
            setupWebRTC(localStream);
            
            // 给一点时间让连接初始化
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // 再次检查连接是否有效
          if (!webrtcHelper.peerConnection) {
            console.error('PeerConnection未初始化，无法创建offer');
            return;
          }
          
          const offer = await webrtcHelper.createOffer();
          if (!offer) {
            console.error('创建提议失败');
            return;
          }
          
          console.log('发送offer到接受方');
          socket.emit('rtc-offer', {
            targetUserId: targetUser.id,
            offer
          });
        }
      } catch (error) {
        console.error('处理接受呼叫错误:', error);
      }
    });
    
    // 监听ICE候选
    socket.on('rtc-candidate', ({ userId, candidate }) => {
      if (userId === targetUser.id) {
        const webrtcHelper = webrtcHelperRef.current;
        if (webrtcHelper && webrtcHelper.peerConnection) {
          webrtcHelper.addIceCandidate(candidate).catch(error => {
            console.warn('添加ICE候选失败:', error);
            // 这里可以选择稍后重试或其他策略
          });
        } else {
          console.warn('尝试添加ICE候选时WebRTC连接未初始化');
        }
      }
    });
    
    // 监听挂断
    socket.on('rtc-handup', ({ userId }) => {
      if (userId === targetUser.id) {
        endCall('对方已挂断');
      }
    });
    
    // 监听取消
    socket.on('rtc-cancel', ({ callerId }) => {
      if (callerId === targetUser.id && !isHost) {
        endCall('对方取消了通话');
      }
    });
    
    // 监听拒绝
    socket.on('rtc-reject', ({ calleeId }) => {
      if (calleeId === targetUser.id && isHost) {
        endCall('对方拒绝了通话');
      }
    });
    
    // 监听错误
    socket.on('rtc-error', ({ message }) => {
      Alert.alert('错误', message);
      navigation.goBack();
    });
    
    // 如果是主持人，直接发送呼叫请求，等待对方接受
    if (isHost) {
      console.log('发送呼叫请求');
      socket.emit('rtc-call', {
        targetUserId: targetUser.id,
        callType: mode
      });
    }
    
    return () => {
      // 移除所有监听器
      socket.off('rtc-offer');
      socket.off('rtc-answer');
      socket.off('rtc-candidate');
      socket.off('rtc-handup');
      socket.off('rtc-cancel');
      socket.off('rtc-reject');
      socket.off('rtc-error');
      socket.off('rtc-accept');
      socket.off('rtc-call-request');
    };
  };
  
  // 开始通话计时
  const startCallTimer = () => {
    timerRef.current = setInterval(() => {
      setCallTimer((prev) => prev + 1);
    }, 1000);
  };
  
  // 切换摄像头
  const switchCamera = async () => {
    if (localStream) {
      try {
        const newIsFront = !isFrontCamera;
        const videoTrack = localStream.getVideoTracks()[0];
        
        if (videoTrack) {
          videoTrack._switchCamera();
          setIsFrontCamera(newIsFront);
        }
      } catch (error) {
        console.error('切换摄像头失败:', error);
      }
    }
  };
  
  // 切换麦克风
  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };
  
  // 切换扬声器
  const toggleSpeaker = async () => {
    try {
      console.log('切换扬声器', Audio);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: 1, // DoNotMix模式值为1
        interruptionModeAndroid: 1, // DoNotMix模式值为1 
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: isEarpiece,
      });
      setIsEarpiece(!isEarpiece);
    } catch (error) {
      console.error('切换扬声器失败:', error);
    }
  };
  
  // 挂断电话
  const hangup = () => {
    // 发送挂断信号
    socket.emit('rtc-handup', { targetUserId: targetUser.id });
    
    // 播放结束音效
    if (endCallSoundRef.current) {
      endCallSoundRef.current.playAsync();
    }
    
    // 清理并返回
    cleanUp();
    navigation.goBack();
  };
  
  // 取消呼叫
  const cancelCall = () => {
    if (isHost) {
      socket.emit('rtc-cancel', { calleeId: targetUser.id });
    } else {
      socket.emit('rtc-reject', { callerId: targetUser.id });
    }
    
    cleanUp();
    navigation.goBack();
  };
  
  // 结束通话
  const endCall = (message) => {
    Alert.alert('通话结束', message, [
      { text: '确定', onPress: () => navigation.goBack() }
    ]);
    
    cleanUp();
  };
  
  // 清理资源
  const cleanUp = () => {
    console.log('开始清理资源');
    
    // 移除socket监听器
    socket.off('rtc-offer');
    socket.off('rtc-answer');
    socket.off('rtc-candidate');
    socket.off('rtc-handup');
    socket.off('rtc-cancel');
    socket.off('rtc-reject');
    socket.off('rtc-error');
    socket.off('rtc-accept');
    socket.off('rtc-call-request');
    
    // 停止音频
    if (callSoundRef.current) {
      callSoundRef.current.stopAsync();
      callSoundRef.current.unloadAsync();
    }
    if (endCallSoundRef.current) {
      endCallSoundRef.current.unloadAsync();
    }
    
    // 关闭定时器
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    // 关闭WebRTC连接
    if (webrtcHelperRef.current) {
      try {
        webrtcHelperRef.current.close();
      } catch (error) {
        console.error('关闭WebRTC连接时出错:', error);
      }
    }
    
    // 关闭本地流
    if (localStream) {
      try {
        localStream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        console.error('关闭媒体轨道时出错:', error);
      }
    }
    
    console.log('资源清理完成');
  };
  
  // 格式化时间
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };
  
  // 渲染通话状态
  const renderCallStatus = () => {
    switch (callStatus) {
      case 'calling':
        return <Text style={styles.statusText}>正在呼叫 {targetUser.showNickName}...</Text>;
      case 'receiving':
        return <Text style={styles.statusText}>等待接通...</Text>;
      case 'connected':
        return <Text style={styles.timeText}>{formatTime(callTimer)}</Text>;
      case 'disconnected':
        return <Text style={styles.statusText}>连接已断开...</Text>;
      default:
        return null;
    }
  };
  
  // 渲染控制按钮
  const renderControls = () => (
    <View style={styles.controlsContainer}>
      {mode === 'video' && (
        <TouchableOpacity
          style={[styles.controlButton, styles.cameraButton]}
          onPress={switchCamera}
        >
          <Text style={styles.controlText}>切换</Text>
        </TouchableOpacity>
      )}
      
      <TouchableOpacity
        style={[styles.controlButton, isMuted ? styles.activeButton : styles.muteButton]}
        onPress={toggleMute}
      >
        <Text style={styles.controlText}>{isMuted ? '解除静音' : '静音'}</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.controlButton, styles.hangupButton]}
        onPress={callStatus === 'connected' ? hangup : cancelCall}
      >
        <Text style={styles.controlText}>{callStatus === 'connected' ? '挂断' : '取消'}</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.controlButton, isEarpiece ? styles.activeButton : styles.speakerButton]}
        onPress={toggleSpeaker}
      >
        <Text style={styles.controlText}>{isEarpiece ? '扬声器' : '听筒'}</Text>
      </TouchableOpacity>
    </View>
  );
  
  // 接受呼叫（当被呼叫方点击接受按钮时调用）
  const acceptCall = () => {
    if (!isHost) {
      socket.emit('rtc-accept', { callerId: targetUser.id });
      setCallStatus('connecting');
    }
  };

  // 主动呼叫（当呼叫方点击呼叫按钮时调用）
  const startCall = () => {
    if (isHost) {
      socket.emit('rtc-call', { 
        targetUserId: targetUser.id,
        callType: mode 
      });
      setCallStatus('calling');
    }
  };
  
  // 辅助函数：创建并发送应答
  const sendAnswer = async (webrtcHelper) => {
    try {
      // 创建应答
      const answer = await webrtcHelper.createAnswer();
      if (!answer) {
        console.error('创建应答失败');
        return false;
      }
      
      // 发送应答
      socket.emit('rtc-answer', {
        targetUserId: targetUser.id,
        answer
      });
      
      console.log('应答已发送');
      return true;
    } catch (error) {
      console.error('创建或发送应答失败:', error);
      return false;
    }
  };
  
  return (
    <SafeAreaView style={styles.container}>
      {mode === 'video' && remoteStream ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={styles.remoteStream}
          objectFit="cover"
          zOrder={0}
        />
      ) : (
        <View style={styles.noVideoContainer}>
          <Text style={styles.nameText}>{targetUser.showNickName}</Text>
        </View>
      )}
      
      {mode === 'video' && localStream && (
        <View
          style={[
            styles.localStreamContainer,
            { top: localViewPosition.y, left: localViewPosition.x }
          ]}
          {...panResponder.panHandlers}
        >
          <RTCView
            streamURL={localStream.toURL()}
            style={styles.localStream}
            objectFit="cover"
            zOrder={1}
            mirror={isFrontCamera}
          />
        </View>
      )}
      
      <View style={styles.statusContainer}>
        {renderCallStatus()}
      </View>
      
      {renderControls()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  remoteStream: {
    flex: 1,
    width: width,
    height: height,
  },
  localStreamContainer: {
    position: 'absolute',
    width: 120,
    height: 180,
    backgroundColor: 'transparent',
    borderRadius: 10,
    overflow: 'hidden',
  },
  localStream: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  noVideoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
  },
  nameText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  statusContainer: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  timeText: {
    fontSize: 16,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  muteButton: {
    backgroundColor: '#555',
  },
  hangupButton: {
    backgroundColor: '#f44336',
  },
  speakerButton: {
    backgroundColor: '#555',
  },
  cameraButton: {
    backgroundColor: '#555',
  },
  activeButton: {
    backgroundColor: '#4caf50',
  },
  controlText: {
    color: '#fff',
    fontSize: 12,
  },
});

export default VideoCallScreen; 