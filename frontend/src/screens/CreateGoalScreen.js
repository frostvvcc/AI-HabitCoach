import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createGoal } from '../services/checkInService';
import { useCheckIn } from '../context/CheckInContext';

export default function CreateGoalScreen({ navigation }) {
  const { refreshData } = useCheckIn();
  const [name, setName] = useState('');
  
  // repeatType: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
  const [repeatType, setRepeatType] = useState('daily'); 
  
  // === 新增：目标模式 ('specific' 指定时间 | 'count' 按次数) ===
  const [targetMode, setTargetMode] = useState('specific'); 
  // === 新增：目标次数 (当 targetMode === 'count' 时使用) ===
  const [targetCount, setTargetCount] = useState(1);

  // 各类型配置 (Specific 模式下使用)
  const [weekDays, setWeekDays] = useState([]); // [0, 1]
  const [monthDays, setMonthDays] = useState(''); // "1, 15"
  const [yearDates, setYearDates] = useState([]); // ["05-20"]
  const [customDates, setCustomDates] = useState([]); // ["2023-10-01"]

  // 提醒相关
  const [enableReminder, setEnableReminder] = useState(false);
  const [reminderTime, setReminderTime] = useState(new Date().setHours(9, 0, 0, 0));
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // 日期选择器 (Yearly/Custom)
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState('year'); 

  // 当切换大类型时，重置一些状态
  useEffect(() => {
    setTargetMode('specific');
    setTargetCount(1);
  }, [repeatType]);

  const handleCreate = async () => {
    if (!name.trim()) return Alert.alert('提示', '请输入目标名称');

    let repeatConfig = {};
    
    // === 每日 (Daily) ===
    // 每日通常不需要"按次数/指定"，默认就是每天1次，暂保持简单
    if (repeatType === 'daily') {
      repeatConfig = {}; // 空对象即代表默认每天
    }
    
    // === 每周 (Weekly) ===
    else if (repeatType === 'weekly') {
      if (targetMode === 'count') {
        if (targetCount < 1 || targetCount > 7) return Alert.alert('提示', '每周次数需在 1-7 之间');
        repeatConfig = { mode: 'count', count: parseInt(targetCount) };
      } else {
        if (weekDays.length === 0) return Alert.alert('提示', '请至少选择一个星期');
        repeatConfig = { mode: 'specific', days: weekDays.sort() };
      }
    } 
    
    // === 每月 (Monthly) ===
    else if (repeatType === 'monthly') {
      if (targetMode === 'count') {
        if (targetCount < 1 || targetCount > 31) return Alert.alert('提示', '每月次数需在 1-31 之间');
        repeatConfig = { mode: 'count', count: parseInt(targetCount) };
      } else {
        const days = monthDays.split(/[,，\s]+/).map(d => parseInt(d)).filter(d => !isNaN(d) && d >= 1 && d <= 31);
        if (days.length === 0) return Alert.alert('提示', '请输入有效的日期 (1-31)');
        repeatConfig = { mode: 'specific', days: [...new Set(days)].sort((a,b)=>a-b) };
      }
    } 
    
    // === 每年 (Yearly) ===
    else if (repeatType === 'yearly') {
      if (targetMode === 'count') {
        if (targetCount < 1 || targetCount > 365) return Alert.alert('提示', '每年次数需在 1-365 之间');
        repeatConfig = { mode: 'count', count: parseInt(targetCount) };
      } else {
        if (yearDates.length === 0) return Alert.alert('提示', '请至少添加一个日期');
        repeatConfig = { mode: 'specific', dates: yearDates };
      }
    } 
    
    // === 自定义 (Custom) - 不用多余的，保持原样 ===
    else if (repeatType === 'custom') {
      if (customDates.length === 0) return Alert.alert('提示', '请至少添加一个具体日期');
      repeatConfig = { dates: customDates };
    }

    try {
      let timeStr = null;
      if (enableReminder) {
        const d = new Date(reminderTime);
        timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      }

      await createGoal({
        name,
        repeatType,
        repeatConfig, // 结构已更新，包含 mode: 'count' | 'specific'
        reminderTime: timeStr,
      });

      refreshData();
      navigation.goBack();
    } catch (error) {
      Alert.alert('创建失败', error.message);
    }
  };

  // 辅助渲染：数字计数器
  const renderCounter = (max) => (
    <View style={styles.counterContainer}>
      <TouchableOpacity 
        style={styles.counterBtn} 
        onPress={() => setTargetCount(prev => Math.max(1, prev - 1))}
      >
        <Ionicons name="remove" size={24} color="#4A90E2" />
      </TouchableOpacity>
      <View style={styles.countDisplay}>
        <TextInput 
          style={styles.countInput}
          keyboardType="number-pad"
          value={String(targetCount)}
          onChangeText={(txt) => {
            const num = parseInt(txt);
            if (!isNaN(num)) setTargetCount(num);
          }}
        />
        <Text style={styles.countUnit}>次</Text>
      </View>
      <TouchableOpacity 
        style={styles.counterBtn} 
        onPress={() => setTargetCount(prev => max ? Math.min(max, prev + 1) : prev + 1)}
      >
        <Ionicons name="add" size={24} color="#4A90E2" />
      </TouchableOpacity>
    </View>
  );

  // 辅助渲染：模式切换器
  const renderModeSwitch = () => (
    <View style={styles.modeSwitchBox}>
      <TouchableOpacity 
        style={[styles.modeBtn, targetMode === 'specific' && styles.modeBtnActive]}
        onPress={() => setTargetMode('specific')}
      >
        <Text style={[styles.modeText, targetMode === 'specific' && styles.modeTextActive]}>指定日期</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.modeBtn, targetMode === 'count' && styles.modeBtnActive]}
        onPress={() => setTargetMode('count')}
      >
        <Text style={[styles.modeText, targetMode === 'count' && styles.modeTextActive]}>按频率</Text>
      </TouchableOpacity>
    </View>
  );

  // 渲染周选择器
  const renderWeekSelector = () => {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return (
      <View style={styles.weekContainer}>
        {days.map((d, index) => {
          const selected = weekDays.includes(index);
          return (
            <TouchableOpacity
              key={index}
              style={[styles.weekBtn, selected && styles.weekBtnSelected]}
              onPress={() => setWeekDays(prev => selected ? prev.filter(i => i !== index) : [...prev, index])}
            >
              <Text style={[styles.weekText, selected && styles.weekTextSelected]}>{d}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // 通用标签渲染器
  const renderDateTags = (dates, setDates, isYearly) => (
    <View style={styles.yearTags}>
      {dates.map((dateStr, idx) => (
        <View key={idx} style={styles.yearTag}>
          <Text style={styles.yearTagText}>{dateStr}</Text>
          <TouchableOpacity onPress={() => setDates(dates.filter((_, i) => i !== idx))}>
            <Ionicons name="close-circle" size={16} color="#666" style={{marginLeft: 4}}/>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity 
        style={styles.addYearBtn} 
        onPress={() => {
          setDatePickerMode(isYearly ? 'year' : 'custom');
          setShowDatePicker(true);
        }}
      >
        <Ionicons name="add" size={16} color="#4A90E2" />
        <Text style={{color:'#4A90E2', fontSize:12}}>添加日期</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>目标名称</Text>
        <TextInput
          style={styles.input}
          placeholder="例如：晨跑、阅读"
          value={name}
          onChangeText={setName}
          maxLength={20}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>打卡频率</Text>
        <View style={styles.typeRow}>
          {[
            { id: 'daily', label: '每天' },
            { id: 'weekly', label: '每周' },
            { id: 'monthly', label: '每月' },
            { id: 'yearly', label: '每年' },
            { id: 'custom', label: '自定义' }
          ].map(type => (
            <TouchableOpacity
              key={type.id}
              style={[styles.typeBtn, repeatType === type.id && styles.typeBtnSelected]}
              onPress={() => setRepeatType(type.id)}
            >
              <Text style={[styles.typeText, repeatType === type.id && styles.typeTextSelected]}>
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 动态配置区域 */}
        <View style={styles.configArea}>
          
          {/* === 每周 === */}
          {repeatType === 'weekly' && (
            <View>
              {renderModeSwitch()}
              <View style={{ marginTop: 15 }}>
                {targetMode === 'specific' ? (
                  <View>
                    <Text style={styles.subLabel}>选择需要打卡的星期：</Text>
                    {renderWeekSelector()}
                  </View>
                ) : (
                  <View>
                    <Text style={styles.subLabel}>每周需要打卡几次：</Text>
                    {renderCounter(7)}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* === 每月 === */}
          {repeatType === 'monthly' && (
            <View>
              {renderModeSwitch()}
              <View style={{ marginTop: 15 }}>
                {targetMode === 'specific' ? (
                  <View>
                    <Text style={styles.subLabel}>输入每月几号 (逗号分隔)：</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="例如: 1, 15, 25"
                      keyboardType="numeric"
                      value={monthDays}
                      onChangeText={setMonthDays}
                    />
                  </View>
                ) : (
                  <View>
                    <Text style={styles.subLabel}>每月需要打卡几次：</Text>
                    {renderCounter(31)}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* === 每年 === */}
          {repeatType === 'yearly' && (
            <View>
              {renderModeSwitch()}
              <View style={{ marginTop: 15 }}>
                {targetMode === 'specific' ? (
                  <View>
                    <Text style={styles.subLabel}>每年固定日期 (忽略年份)：</Text>
                    {renderDateTags(yearDates, setYearDates, true)}
                  </View>
                ) : (
                  <View>
                    <Text style={styles.subLabel}>每年需要打卡几次：</Text>
                    {renderCounter(365)}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* === 自定义 === */}
          {repeatType === 'custom' && (
            <View>
              <Text style={styles.subLabel}>具体打卡日期 (年月日)：</Text>
              {renderDateTags(customDates, setCustomDates, false)}
            </View>
          )}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.label}>打卡提醒</Text>
          <Switch
            value={enableReminder}
            onValueChange={setEnableReminder}
            trackColor={{ false: "#e0e0e0", true: "#b3d4fc" }}
            thumbColor={enableReminder ? "#4A90E2" : "#f4f3f4"}
          />
        </View>
        
        {enableReminder && (
          <TouchableOpacity 
            style={styles.timePickerBtn}
            onPress={() => setShowTimePicker(true)}
          >
            <Text style={styles.timeValue}>
              {new Date(reminderTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}
            </Text>
            <Ionicons name="time-outline" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
        <Text style={styles.createBtnText}>创建目标</Text>
      </TouchableOpacity>

      {/* Picker Modals */}
      {showTimePicker && (
        <DateTimePicker
          value={new Date(reminderTime)}
          mode="time"
          display="default"
          onChange={(event, selectedDate) => {
            setShowTimePicker(false);
            if (selectedDate) setReminderTime(selectedDate.getTime());
          }}
        />
      )}

      {showDatePicker && (
        <DateTimePicker
          value={new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              const y = selectedDate.getFullYear();
              const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
              const d = String(selectedDate.getDate()).padStart(2, '0');
              
              if (datePickerMode === 'year') {
                const str = `${m}-${d}`;
                if (!yearDates.includes(str)) setYearDates([...yearDates, str].sort());
              } else {
                const str = `${y}-${m}-${d}`;
                if (!customDates.includes(str)) setCustomDates([...customDates, str].sort());
              }
            }
          }}
        />
      )}
      <View style={{height: 40}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 15 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 20, marginBottom: 15 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  subLabel: { fontSize: 13, color: '#666', marginBottom: 8 },
  input: { backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12, fontSize: 16, color: '#333' },
  
  // 类型按钮
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  typeBtn: { paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center', borderRadius: 20, backgroundColor: '#f5f5f5', minWidth: '18%' },
  typeBtnSelected: { backgroundColor: '#4A90E2' },
  typeText: { color: '#666', fontSize: 12 },
  typeTextSelected: { color: '#fff', fontWeight: 'bold' },
  
  configArea: { marginTop: 5, padding: 15, backgroundColor: '#f8f9fa', borderRadius: 8 },
  
  // 模式切换 (指定/频率)
  modeSwitchBox: { flexDirection: 'row', backgroundColor: '#e9ecef', borderRadius: 8, padding: 2 },
  modeBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  modeBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2 },
  modeText: { fontSize: 13, color: '#666' },
  modeTextActive: { color: '#4A90E2', fontWeight: '600' },
  
  // 计数器样式
  counterContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15, marginTop: 10 },
  counterBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#eee' },
  countDisplay: { flexDirection: 'row', alignItems: 'flex-end', minWidth: 80, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#ccc' },
  countInput: { fontSize: 32, fontWeight: 'bold', color: '#333', textAlign: 'center', minWidth: 40 },
  countUnit: { fontSize: 14, color: '#666', marginBottom: 8, marginLeft: 4 },

  // 星期选择
  weekContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  weekBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#eee' },
  weekBtnSelected: { backgroundColor: '#4A90E2', borderColor: '#4A90E2' },
  weekText: { fontSize: 12, color: '#666' },
  weekTextSelected: { color: '#fff' },
  
  // 日期标签
  yearTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yearTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef6ff', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 },
  yearTagText: { color: '#4A90E2', fontSize: 13 },
  addYearBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: '#4A90E2', borderStyle: 'dashed' },
  
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timePickerBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 10, backgroundColor: '#f5f5f5', padding: 8, borderRadius: 8 },
  timeValue: { fontSize: 16, color: '#333', marginRight: 8, fontWeight: '500' },
  
  createBtn: { backgroundColor: '#4A90E2', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 10 },
  createBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});