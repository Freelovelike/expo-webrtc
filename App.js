import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { io } from 'socket.io-client';
import * as ScreenOrientation from 'expo-screen-orientation';
import { enableScreens } from 'react-native-screens';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// 启用 screens
enableScreens();

// 导入页面组件
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import VideoCallScreen from './screens/VideoCallScreen';

// 创建导航栈
const Stack = createStackNavigator();

// 创建socket实例
const socket = io('http://192.168.1.115:5000');

export default function App() {
  const [user, setUser] = useState(null);
  
  // 锁定屏幕方向为竖屏
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    
    // socket连接监听
    socket.on('connect', () => {
      console.log('Socket 已连接:', socket.id);
    });
    
    socket.on('disconnect', () => {
      console.log('Socket 已断开');
    });
    
    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);
  
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          {!user ? (
            <Stack.Screen 
              name="Login" 
              options={{ headerShown: false }}
            >
              {props => <LoginScreen {...props} socket={socket} setUser={setUser} />}
            </Stack.Screen>
          ) : (
            <>
              <Stack.Screen 
                name="Home" 
                options={{ 
                  title: `${user.username} 的主页`,
                  headerLeft: null,
                  gestureEnabled: false
                }}
              >
                {props => <HomeScreen {...props} socket={socket} user={user} />}
              </Stack.Screen>
              
              <Stack.Screen 
                name="VideoCall" 
                options={{ 
                  headerShown: false,
                  gestureEnabled: false
                }}
              >
                {props => <VideoCallScreen {...props} socket={socket} user={user} />}
              </Stack.Screen>
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
