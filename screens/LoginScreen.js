import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import axios from 'axios';

const API_URL = 'http://192.168.1.115:5000/api';

const LoginScreen = ({ socket, setUser }) => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim()) {
      Alert.alert('提示', '请输入用户名');
      return;
    }

    setLoading(true);
    try {
      // 发送登录请求
      const response = await axios.post(`${API_URL}/auth/login`, { username });
      
      if (response.data.success) {
        const userData = response.data.data;
        
        // 存储登录信息
        setUser(userData.user);
        
        // 向Socket.IO服务器发送登录事件
        socket.emit('user-login', { userId: userData.user.id });
      }
    } catch (error) {
      console.error('登录错误:', error);
      Alert.alert('登录失败', error.response?.data?.message || '连接服务器失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.loginContainer}>
        <Image
          source={{ uri: 'https://img.icons8.com/color/96/000000/video-call.png' }}
          style={styles.logo}
        />
        <Text style={styles.title}>视频通话应用</Text>
        
        <TextInput
          style={styles.input}
          placeholder="请输入用户名"
          placeholderTextColor="#999"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        
        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.loginButtonText}>登录</Text>
          )}
        </TouchableOpacity>
        
        <Text style={styles.hint}>
          提示: 直接输入任意用户名即可登录
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    padding: 20,
  },
  loginContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    alignItems: 'center',
  },
  logo: {
    width: 80,
    height: 80,
    marginVertical: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 20,
  },
  loginButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#4a90e2',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    marginTop: 20,
    color: '#999',
    textAlign: 'center',
  },
});

export default LoginScreen; 