import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image
} from 'react-native';
import axios from 'axios';

const API_URL = 'http://192.168.1.116:5000/api';

const HomeScreen = ({ navigation, socket, user }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targetUsername, setTargetUsername] = useState('');
  const [callMode, setCallMode] = useState('video'); // video 或 voice

  // 获取在线用户列表
  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/users`);
      if (response.data.success) {
        // 过滤掉自己
        const filteredUsers = response.data.data.filter(u => u.id !== user.id);
        setUsers(filteredUsers);
      }
    } catch (error) {
      console.error('获取用户列表错误:', error);
      Alert.alert('错误', '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    
    // 监听来电
    socket.on('rtc-setup', handleIncomingCall);
    
    return () => {
      socket.off('rtc-setup');
    };
  }, []);

  // 处理接收到的呼叫
  const handleIncomingCall = ({ callerId, mode }) => {
    // 查找呼叫者信息
    const caller = users.find(u => u.id === callerId) || { 
      id: callerId, 
      username: callerId,
      showNickName: callerId
    };
    
    // 显示来电提示
    Alert.alert(
      `来电通知`,
      `${caller.showNickName} 邀请您进行${mode === 'video' ? '视频' : '语音'}通话`,
      [
        {
          text: '拒绝',
          style: 'cancel',
          onPress: () => {
            socket.emit('rtc-reject', { callerId });
          },
        },
        {
          text: '接受',
          onPress: () => {
            // 接受通话并跳转到视频通话页面
            socket.emit('rtc-accept', { callerId });
            navigation.navigate('VideoCall', { 
              targetUser: caller, 
              mode, 
              isHost: false 
            });
          },
        },
      ],
      { cancelable: false }
    );
  };

  // 发起通话
  const startCall = (targetUser, mode) => {
    // 发送通话请求
    socket.emit('rtc-setup', {
      targetUserId: targetUser.id,
      mode
    });

    // 跳转到通话页面
    navigation.navigate('VideoCall', {
      targetUser,
      mode,
      isHost: true
    });
  };

  // 根据用户名搜索并发起通话
  const searchAndCall = () => {
    if (!targetUsername.trim()) {
      Alert.alert('提示', '请输入对方用户名');
      return;
    }

    // 查找用户
    const targetUser = users.find(u => 
      u.username.toLowerCase() === targetUsername.toLowerCase() || 
      u.id.toLowerCase() === targetUsername.toLowerCase()
    );

    if (targetUser) {
      startCall(targetUser, callMode);
    } else {
      Alert.alert('提示', '找不到该用户，请确认用户名正确');
    }
  };

  // 渲染用户列表项
  const renderUserItem = ({ item }) => (
    <View style={styles.userItem}>
      <Image 
        source={{ uri: item.headImage || `https://avatars.dicebear.com/api/avataaars/${item.id}.svg` }} 
        style={styles.avatar} 
      />
      
      <View style={styles.userInfo}>
        <Text style={styles.username}>{item.showNickName}</Text>
        <Text style={styles.status}>
          {item.online ? '在线' : '离线'}
        </Text>
      </View>
      
      <View style={styles.callButtons}>
        <TouchableOpacity
          style={[styles.callButton, styles.videoButton]}
          onPress={() => startCall(item, 'video')}
        >
          <Text style={styles.buttonText}>视频</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.callButton, styles.voiceButton]}
          onPress={() => startCall(item, 'voice')}
        >
          <Text style={styles.buttonText}>语音</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="输入对方用户名"
          value={targetUsername}
          onChangeText={setTargetUsername}
          autoCapitalize="none"
        />
        
        <View style={styles.callTypeSection}>
          <TouchableOpacity
            style={[
              styles.callTypeButton,
              callMode === 'video' && styles.activeCallType
            ]}
            onPress={() => setCallMode('video')}
          >
            <Text style={callMode === 'video' ? styles.activeText : styles.inactiveText}>
              视频通话
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.callTypeButton,
              callMode === 'voice' && styles.activeCallType
            ]}
            onPress={() => setCallMode('voice')}
          >
            <Text style={callMode === 'voice' ? styles.activeText : styles.inactiveText}>
              语音通话
            </Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity
          style={styles.searchButton}
          onPress={searchAndCall}
        >
          <Text style={styles.searchButtonText}>发起通话</Text>
        </TouchableOpacity>
      </View>
      
      <Text style={styles.sectionTitle}>在线用户</Text>
      
      {loading ? (
        <ActivityIndicator size="large" color="#4a90e2" style={styles.loading} />
      ) : users.length > 0 ? (
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContainer}
        />
      ) : (
        <Text style={styles.emptyText}>暂无其他在线用户</Text>
      )}
      
      <TouchableOpacity
        style={styles.refreshButton}
        onPress={fetchUsers}
      >
        <Text style={styles.refreshButtonText}>刷新用户列表</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 15,
  },
  searchSection: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  searchInput: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 15,
  },
  callTypeSection: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  callTypeButton: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    marginHorizontal: 5,
  },
  activeCallType: {
    backgroundColor: '#e6f0fa',
  },
  activeText: {
    color: '#4a90e2',
    fontWeight: '600',
  },
  inactiveText: {
    color: '#888',
  },
  searchButton: {
    backgroundColor: '#4a90e2',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  listContainer: {
    paddingBottom: 20,
  },
  userItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    alignItems: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
  },
  status: {
    fontSize: 14,
    color: '#4caf50',
    marginTop: 4,
  },
  callButtons: {
    flexDirection: 'row',
  },
  callButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 5,
    marginLeft: 5,
  },
  videoButton: {
    backgroundColor: '#4a90e2',
  },
  voiceButton: {
    backgroundColor: '#4caf50',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  loading: {
    marginTop: 30,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 30,
    fontSize: 16,
  },
  refreshButton: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  refreshButtonText: {
    color: '#666',
    fontWeight: '600',
  },
});

export default HomeScreen; 