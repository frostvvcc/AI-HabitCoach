import React, { useState, useEffect } from 'react';
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

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CheckInProvider } from './src/context/CheckInContext';

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
            // 使用列表图标，强调“今日清单”
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === '任务') {
            // 使用层叠图标，强调“任务管理/库”
            iconName = focused ? 'layers' : 'layers-outline';
          } else if (route.name === '统计') {
            iconName = focused ? 'stats-chart' : 'stats-chart-outline';
          } else if (route.name === '我的') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#4A90E2',
        tabBarInactiveTintColor: 'gray',
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
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CheckInProvider>
        <StatusBar style="auto" />
        <AppNavigator />
      </CheckInProvider>
    </AuthProvider>
  );
}