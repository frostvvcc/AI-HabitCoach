import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useCheckIn } from '../context/CheckInContext';
import { createCheckIn } from '../services/checkInService';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export default function RecordCheckInScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { refreshData } = useCheckIn();
  
  const initialDate = route.params?.initialDate 
    ? new Date(route.params.initialDate) 
    : new Date();
  
  const [name, setName] = useState('');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialDate);
  const [note, setNote] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('提示', '请输入打卡名称');
      return;
    }

    // 合并日期和时间
    const checkInDateTime = new Date(date);
    checkInDateTime.setHours(time.getHours(), time.getMinutes(), 0, 0);

    // 检查日期不能超过今天
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (checkInDateTime > today) {
      Alert.alert('提示', '不能记录未来的打卡');
      return;
    }

    // 检查补卡日期不能超过3天前
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    threeDaysAgo.setHours(0, 0, 0, 0);
    if (checkInDateTime < threeDaysAgo) {
      Alert.alert('提示', '只能补最近3天的打卡记录');
      return;
    }

    // 使用本地时间格式，而不是UTC时间
    const year = checkInDateTime.getFullYear();
    const month = String(checkInDateTime.getMonth() + 1).padStart(2, '0');
    const day = String(checkInDateTime.getDate()).padStart(2, '0');
    const hours = String(checkInDateTime.getHours()).padStart(2, '0');
    const minutes = String(checkInDateTime.getMinutes()).padStart(2, '0');
    const seconds = String(checkInDateTime.getSeconds()).padStart(2, '0');
    const localDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    try {
      await createCheckIn({
        name: name.trim(),
        date: localDateTime,
        note: note.trim() || undefined,
        isManual: true,
      });
      
      refreshData();
      navigation.goBack();
      Alert.alert('成功', '打卡记录已保存！');
    } catch (error) {
      Alert.alert('失败', '保存失败，请重试');
    }
  };

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={true}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>打卡名称 *</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：晨跑、阅读、冥想"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>打卡日期 *</Text>
          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateTimeButtonText}>
              {format(date, 'yyyy年MM月dd日', { locale: zhCN })}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              onChange={(event, selectedDate) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (selectedDate) {
                  setDate(selectedDate);
                }
              }}
            />
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>打卡时间 *</Text>
          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => setShowTimePicker(true)}
          >
            <Text style={styles.dateTimeButtonText}>
              {format(time, 'HH:mm', { locale: zhCN })}
            </Text>
          </TouchableOpacity>
          {showTimePicker && (
            <DateTimePicker
              value={time}
              mode="time"
              is24Hour={true}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, selectedTime) => {
                setShowTimePicker(Platform.OS === 'ios');
                if (selectedTime) {
                  setTime(selectedTime);
                }
              }}
            />
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>备注（可选）</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="记录一些想法或感受..."
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>保存记录</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    paddingTop: 60,
    paddingBottom: 20,
  },
  form: {
    padding: 20,
    paddingTop: 50,
  },
  field: {
    marginBottom: 25,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    height: 100,
    paddingTop: 15,
  },
  dateTimeButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateTimeButtonText: {
    fontSize: 16,
    color: '#333',
  },
  saveButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

