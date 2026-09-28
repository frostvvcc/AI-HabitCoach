// ⚠️ 必须是整个 App 的第一行 import —— gesture-handler 在旧架构下要求最先加载
import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 导入页面组件
import LoginScreen from './src/screens/LoginScreen';
import TodoScreen from './src/screens/TodoScreen'; // 对应你改名后的待办页面
import CheckInScreen from './src/screens/CheckInScreen'; // 具体的任务管理列表
import StatsScreen from './src/screens/StatsScreen';
import MyScreen from './src/screens/MyScreen';
import CreateGoalScreen from './src/screens/CreateGoalScreen';
import RecordCheckInScreen from './src/screens/RecordCheckInScreen';
import DayDetailScreen from './src/screens/DayDetailScreen';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CheckInProvider } from './src/context/CheckInContext';
import FloatingAI from './src/components/FloatingAI';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// 主标签导航
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === '待办') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === '任务') {
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === '统计') {
            iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          } else if (route.name === '我的') {
            iconName = focused ? 'person-circle' : 'person-circle-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        headerShown: false,
      })}
    >
      <Tab.Screen name="待办" component={TodoScreen} />
      <Tab.Screen name="任务" component={CheckInScreen} />
      <Tab.Screen name="统计" component={StatsScreen} />
      <Tab.Screen name="我的" component={MyScreen} />
    </Tab.Navigator>
  );
}

// 主导航栈
function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // 可以添加加载屏幕
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen 
              name="CreateGoal" 
              component={CreateGoalScreen}
              options={{ 
                headerShown: true, 
                title: '创建任务',
                headerBackTitle: '返回'
              }}
            />
            <Stack.Screen
              name="RecordCheckIn"
              component={RecordCheckInScreen}
              options={{
                headerShown: true,
                title: '记录打卡',
                headerBackTitle: '返回'
              }}
            />
            <Stack.Screen
              name="DayDetail"
              component={DayDetailScreen}
              options={{ headerShown: false }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function FloatingAIWrapper() {
  const { user } = useAuth();
  if (!user) return null;
  return <FloatingAI />;
}

export default function App() {
  return (
    // GestureHandlerRootView 包住整个 App —— 这样根部的 FloatingAI 悬浮球
    // 以及任何子页面都能使用 react-native-gesture-handler 的手势
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <CheckInProvider>
          <StatusBar style="auto" />
          <AppNavigator />
          <FloatingAIWrapper />
        </CheckInProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}