import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// 配置通知行为
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// 请求通知权限
export const requestPermissions = async () => {
  if (!Device.isDevice) {
    console.warn('通知功能仅在真实设备上可用');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('通知权限未授予');
    return false;
  }

  // Android需要设置通知渠道
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '打卡提醒',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4A90E2',
    });
  }

  return true;
};

// 创建每日提醒通知
export const scheduleDailyReminder = async (goalId, goalName, reminderTime) => {
  try {
    // 解析提醒时间（格式：HH:mm）
    const [hours, minutes] = reminderTime.split(':').map(Number);

    // 取消之前的通知（如果存在）
    await cancelReminder(goalId);

    // 创建每日重复通知
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '打卡提醒',
        body: `该完成"${goalName}"的打卡了！`,
        sound: true,
        data: { goalId, type: 'daily_reminder' },
      },
      trigger: {
        hour: hours,
        minute: minutes,
        repeats: true,
      },
    });

    return notificationId;
  } catch (error) {
    console.error('创建提醒通知失败:', error);
    throw error;
  }
};

// 取消提醒通知
export const cancelReminder = async (goalId) => {
  try {
    const allNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const notificationsToCancel = allNotifications.filter(
      notification => notification.content.data?.goalId === goalId
    );

    for (const notification of notificationsToCancel) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  } catch (error) {
    console.error('取消提醒通知失败:', error);
  }
};

// 获取所有已安排的提醒
export const getAllScheduledReminders = async () => {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('获取提醒列表失败:', error);
    return [];
  }
};

// 取消所有提醒
export const cancelAllReminders = async () => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('取消所有提醒失败:', error);
  }
};









