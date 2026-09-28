import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
  TouchableWithoutFeedback,
  Image,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, { ScaleDecorator, OpacityDecorator } from 'react-native-draggable-flatlist';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { RectButton, GestureHandlerRootView } from 'react-native-gesture-handler'; // 引入 GestureHandlerRootView
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

// 引入日期处理函数
import { 
  format, getDaysInMonth, startOfMonth, getDay, isSameDay, isAfter, isBefore, 
  getDate, getMonth, addMonths, subMonths, startOfDay, 
  startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, 
  subYears, addYears, startOfYear
} from 'date-fns';
import { zhCN } from 'date-fns/locale';

import { useCheckIn } from '../context/CheckInContext';
import { checkInGoal, deleteGoal, updateGoal, getGroups, createGroup, deleteGroup, reorderGroups, reorderGoals } from '../services/checkInService';

const GROUP_SORT_ORDER_KEY = 'group_sort_order';
const GROUP_EXPAND_STATE_KEY = 'group_expand_state';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ==========================================
// 0. 辅助函数 & 统计组件
// ==========================================

const parseGoalConfig = (goal) => {
  try {
    const config = goal.repeat_config ? (typeof goal.repeat_config === 'string' ? JSON.parse(goal.repeat_config) : goal.repeat_config) : {};
    return config || {};
  } catch (e) { return {}; }
};

// 判断任务类型: 1=固定时间, 2=自由, 3=频次
const getGoalTypeCategory = (goal) => {
    const config = parseGoalConfig(goal);
    if (goal.repeat_type === 'flexible') return 2; // 自由
    if (config.mode === 'count') return 3; // 频次
    return 1; // 固定时间
};

// --- 周视图组件 ---
const WeeklyFreqView = ({ goal, checkInsByDate, historyRecords, onRecordPress }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const config = parseGoalConfig(goal);
  const targetCount = config.count || 1;
    
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const completedCount = weekDays.filter(d => checkInsByDate[format(d, 'yyyy-MM-dd')]).length;

  const handleDayPress = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const record = historyRecords.find(r => {
      const rDateStr = typeof r.checkin_date === 'string' ? r.checkin_date.split(' ')[0] : format(new Date(r.checkin_date), 'yyyy-MM-dd');
      return rDateStr === dateStr;
    });
    if (record) onRecordPress(record);
  };

  return (
    <View style={styles.viewContainer}>
      <View style={styles.calHeader}>
        <TouchableOpacity onPress={() => setCurrentDate(subWeeks(currentDate, 1))}>
          <Ionicons name="chevron-back" size={20} color="#8E8E93" />
        </TouchableOpacity>
        <View style={{alignItems: 'center'}}>
          <Text style={styles.calMonth}>{format(weekStart, 'MM.dd')} - {format(weekEnd, 'MM.dd')}</Text>
          <Text style={[styles.progressText, { color: completedCount >= targetCount ? '#34C759' : '#FF9500' }]}>
            本周完成: {completedCount} / {targetCount}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setCurrentDate(addWeeks(currentDate, 1))}>
          <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>
      <View style={styles.weekGrid}>
        {weekDays.map((date, index) => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const isChecked = checkInsByDate[dateStr] > 0;
          const isToday = isSameDay(date, new Date());
          return (
            <TouchableOpacity 
              key={index} 
              style={[styles.weekDayItem, isChecked && styles.weekDayChecked, !isChecked && isToday && styles.weekDayToday]}
              onPress={() => handleDayPress(date)}
            >
              <Text style={[styles.weekDayTitle, isChecked && {color:'#fff'}]}>{format(date, 'EEE', { locale: zhCN })}</Text>
              <Text style={[styles.weekDayNum, isChecked && {color:'#fff'}]}>{format(date, 'd')}</Text>
              {isChecked && <Ionicons name="checkmark-circle" size={16} color="#fff" style={{marginTop: 4}} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// --- 年视图组件 ---
const YearlyFreqView = ({ goal, checkInsByDate, historyRecords, onRecordPress }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const config = parseGoalConfig(goal);
  const targetCount = config.count || 1;
  const currentYearStr = format(currentDate, 'yyyy');
  const yearTotal = Object.keys(checkInsByDate).filter(d => d.startsWith(currentYearStr)).length;
  const months = Array.from({ length: 12 }, (_, i) => new Date(currentDate.getFullYear(), i, 1));

  return (
    <View style={styles.viewContainer}>
      <View style={styles.calHeader}>
        <TouchableOpacity onPress={() => setCurrentDate(subYears(currentDate, 1))}>
          <Ionicons name="chevron-back" size={20} color="#8E8E93" />
        </TouchableOpacity>
        <View style={{alignItems: 'center'}}>
          <Text style={styles.calMonth}>{format(currentDate, 'yyyy年')}</Text>
          <Text style={[styles.progressText, { color: yearTotal >= targetCount ? '#34C759' : '#666' }]}>
            今年完成: {yearTotal} / {targetCount}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setCurrentDate(addYears(currentDate, 1))}>
          <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>
      <View style={styles.yearGrid}>
        {months.map(monthDate => {
          const daysInMonth = getDaysInMonth(monthDate);
          const offset = getDay(startOfMonth(monthDate)) === 0 ? 6 : getDay(startOfMonth(monthDate)) - 1;
          const days = Array(offset).fill(null).concat(Array.from({length:daysInMonth}, (_,i)=> new Date(monthDate.getFullYear(), monthDate.getMonth(), i+1)));
          
          return (
            <View style={styles.miniMonthContainer} key={monthDate.getMonth()}>
              <Text style={styles.miniMonthTitle}>{monthDate.getMonth() + 1}月</Text>
              <View style={styles.miniMonthGrid}>
                {days.map((date, idx) => {
                  if(!date) return <View key={`e-${idx}`} style={styles.miniDayEmpty} />;
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const isChecked = checkInsByDate[dateStr] > 0;
                  return <View key={dateStr} style={[styles.miniDay, isChecked && styles.miniDayChecked]} />;
                })}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// --- 月视图 (Count模式) ---
const MonthlyFreqView = ({ goal, checkInsByDate, historyRecords, onRecordPress }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const config = parseGoalConfig(goal);
  const targetCount = config.count || 1;
  const currentMonthStr = format(currentDate, 'yyyy-MM');
  const monthTotal = Object.keys(checkInsByDate).filter(d => d.startsWith(currentMonthStr)).length;

  const handleDayPress = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const record = historyRecords.find(r => {
      const rDateStr = typeof r.checkin_date === 'string' ? r.checkin_date.split(' ')[0] : format(new Date(r.checkin_date), 'yyyy-MM-dd');
      return rDateStr === dateStr;
    });
    if (record) onRecordPress(record);
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const offset = getDay(startOfMonth(currentDate)) === 0 ? 6 : getDay(startOfMonth(currentDate)) - 1;
  const calendarGrid = [];
  for (let i = 0; i < offset; i++) calendarGrid.push({ type: 'empty', id: `empty-${i}` });
  for (let i = 1; i <= daysInMonth; i++) calendarGrid.push({ type: 'day', date: new Date(currentDate.getFullYear(), currentDate.getMonth(), i), id: `day-${i}` });

  return (
    <View style={styles.viewContainer}>
      <View style={styles.calHeader}>
        <TouchableOpacity onPress={() => setCurrentDate(subMonths(currentDate, 1))}>
          <Ionicons name="chevron-back" size={20} color="#8E8E93" />
        </TouchableOpacity>
        <View style={{alignItems: 'center'}}>
          <Text style={styles.calMonth}>{format(currentDate, 'yyyy年 MM月')}</Text>
          <Text style={[styles.progressText, { color: monthTotal >= targetCount ? '#34C759' : '#FF9500' }]}>
            本月完成: {monthTotal} / {targetCount}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setCurrentDate(addMonths(currentDate, 1))}>
          <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>
      <View style={styles.calWeekRow}>{['一','二','三','四','五','六','日'].map(d => <Text key={d} style={styles.calWeekText}>{d}</Text>)}</View>
      <View style={styles.calGrid}>
        {calendarGrid.map(item => {
          if (item.type === 'empty') return <View style={styles.calDay} key={item.id} />;
          const dateStr = format(item.date, 'yyyy-MM-dd');
          const isChecked = checkInsByDate[dateStr] > 0;
          const isToday = isSameDay(item.date, new Date());
          return (
             <TouchableOpacity 
               key={item.id}
               style={[styles.calDay, isChecked && {backgroundColor: '#E5F9E7'}, !isChecked && isToday && {borderWidth:1, borderColor:'#007AFF'}]}
               onPress={() => handleDayPress(item.date)}
             >
               <Text style={[styles.calDayText, isChecked && {color:'#34C759'}, isToday && {fontWeight:'bold'}]}>{item.date.getDate()}</Text>
               {isChecked && <View style={styles.statusIconContainer}><Ionicons name="checkmark" size={12} color="#34C759" /></View>}
             </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// --- 标准月历 (Standard) ---
const StandardMonthlyCalendar = ({ goal, checkInsByDate, historyRecords, onRecordPress }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const effectiveStartDate = startOfDay(new Date(goal.start_date || goal.created_at));

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const isTargetDate = (date) => {
    if (goal.repeat_type === 'flexible') return false; 
    if (isBefore(date, effectiveStartDate)) return false; 

    if (goal.repeat_type === 'daily') return true;
    try {
      const config = goal.repeat_config ? (typeof goal.repeat_config === 'string' ? JSON.parse(goal.repeat_config) : goal.repeat_config) : {};
      
      if (goal.repeat_type === 'weekly') return config.days?.includes(getDay(date));
      if (goal.repeat_type === 'monthly') return config.days?.includes(getDate(date));
      if (goal.repeat_type === 'yearly') {
        const m = String(getMonth(date) + 1).padStart(2, '0');
        const d = String(getDate(date)).padStart(2, '0');
        return config.dates?.includes(`${m}-${d}`);
      }
      if (goal.repeat_type === 'custom') return config.dates?.includes(format(date, 'yyyy-MM-dd'));
    } catch (e) { return false; }
    return false;
  };

  const handleDayPress = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const record = historyRecords.find(r => {
      const rDateStr = typeof r.checkin_date === 'string' ? r.checkin_date.split(' ')[0] : format(new Date(r.checkin_date), 'yyyy-MM-dd');
      return rDateStr === dateStr;
    });
    if (record) onRecordPress(record);
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const offset = getDay(startOfMonth(currentDate)) === 0 ? 6 : getDay(startOfMonth(currentDate)) - 1;
  const calendarGrid = [];
  for (let i = 0; i < offset; i++) calendarGrid.push({ type: 'empty', id: `empty-${i}` });
  for (let i = 1; i <= daysInMonth; i++) calendarGrid.push({ type: 'day', date: new Date(currentDate.getFullYear(), currentDate.getMonth(), i), id: `day-${i}` });

  const renderDay = (item) => {
    if (item.type === 'empty') return <View style={styles.calDay} key={item.id} />;
    
    const dateStr = format(item.date, 'yyyy-MM-dd');
    const isChecked = checkInsByDate[dateStr] > 0;
    const isTarget = isTargetDate(item.date);
    const today = new Date();
    const isToday = isSameDay(item.date, today);
    const isPast = isBefore(item.date, today) && !isToday;
    const isFuture = isAfter(item.date, today) && !isToday;
    const isBeforeStart = isBefore(item.date, effectiveStartDate);

    let bgColor = 'transparent';
    let textColor = '#333';
    let icon = null;
    let borderColor = 'transparent';

    if (isChecked) {
      bgColor = '#E5F9E7'; borderColor = 'transparent'; textColor = '#34C759';
      icon = <Ionicons name="checkmark" size={14} color="#34C759" />;
    } else if (isTarget && isPast) {
      bgColor = '#FFEBEE'; textColor = '#FF3B30';
      icon = <Ionicons name="close" size={14} color="#FF3B30" />;
    } else if (isTarget && isToday) {
      bgColor = '#F2F2F7'; borderColor = '#007AFF'; textColor = '#333';
      icon = <View style={[styles.statusDot, { borderColor: '#007AFF' }]} />;
    } else if (isTarget && isFuture) {
      bgColor = 'transparent'; textColor = '#666'; 
      icon = <View style={[styles.statusDot, { borderColor: '#8E8E93' }]} />;
    } else {
      if (goal.repeat_type === 'flexible') {
        textColor = isBeforeStart ? '#E5E5EA' : '#333';
      } else {
        textColor = '#E5E5EA'; 
      }
    }

    return (
      <TouchableOpacity 
        style={[styles.calDay, { backgroundColor: bgColor, borderColor: borderColor, borderWidth: borderColor !== 'transparent' ? 1 : 0 }]} 
        key={item.id} activeOpacity={isChecked ? 0.6 : 1} onPress={() => handleDayPress(item.date)}
      >
        <Text style={[styles.calDayText, { color: textColor, fontWeight: isToday ? 'bold' : 'normal' }]}>{item.date.getDate()}</Text>
        <View style={styles.statusIconContainer}>{icon}</View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.calHeader}>
        <TouchableOpacity onPress={prevMonth} hitSlop={{top:10,bottom:10,left:10,right:10}}>
          <Ionicons name="chevron-back" size={18} color="#8E8E93" />
        </TouchableOpacity>
        <Text style={styles.calMonth}>{format(currentDate, 'yyyy年 MM月')}</Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={{top:10,bottom:10,left:10,right:10}}>
          <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
        </TouchableOpacity>
      </View>
      <View style={styles.calWeekRow}>{['一','二','三','四','五','六','日'].map(d => <Text key={d} style={styles.calWeekText}>{d}</Text>)}</View>
      <View style={styles.calGrid}>{calendarGrid.map(renderDay)}</View>
    </View>
  );
};

// --- 智能路由容器 ---
const GoalCalendar = (props) => {
  const { goal } = props;
  const config = parseGoalConfig(goal);

  if (config.mode === 'count') {
    if (goal.repeat_type === 'weekly') return <WeeklyFreqView {...props} />;
    if (goal.repeat_type === 'monthly') return <MonthlyFreqView {...props} />;
    if (goal.repeat_type === 'yearly') return <YearlyFreqView {...props} />;
  }
  return <StandardMonthlyCalendar {...props} />;
};

// ==========================================
// 1. 管理分组弹窗组件
// ==========================================
const GroupManageModal = ({ visible, onClose, groups, onUpdateGroups, onLocalReorder, onDeleteGroupWithTasks }) => {
  const [localGroups, setLocalGroups] = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => { setLocalGroups(groups); }, [groups]);

  const handleAdd = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createGroup(newGroupName);
      setNewGroupName('');
      setIsAdding(false);
      onUpdateGroups();
    } catch (e) { Alert.alert('错误', '创建失败'); }
  };

  const handleDragEnd = async ({ data }) => {
    setLocalGroups(data);
    onLocalReorder(data);
    const realGroups = [];
    let sortIndex = 0;
    data.forEach(item => {
      if (item.id !== 'default') {
        realGroups.push({ id: item.id, sort_order: sortIndex });
        sortIndex++;
      }
    });
    if (realGroups.length > 0) {
      try { await reorderGroups(realGroups); } catch (e) {}
    }
  };

  const handleDelete = (group) => {
    if (group.id === 'default') {
      Alert.alert('提示', '默认分组不可删除');
      return;
    }
    Alert.alert(
      '删除分组', 
      `您可以选择保留任务或同时删除任务`, 
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '仅删除分组', 
          onPress: async () => { 
             await onDeleteGroupWithTasks(group.id, 'only_group');
          } 
        },
        { 
          text: '删除分组及任务', 
          style: 'destructive', 
          onPress: async () => { 
             await onDeleteGroupWithTasks(group.id, 'all');
          } 
        }
      ]
    );
  };

  const renderItem = ({ item, drag, isActive }) => (
    <ScaleDecorator>
      <OpacityDecorator>
        <View style={[styles.manageGroupCard, isActive && styles.activeDragItem]}>
          <View style={styles.manageGroupContent}>
            <TouchableOpacity 
              onLongPress={drag} 
              delayLongPress={50}
              hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}
              style={styles.manageDragHandle}
            >
              <Ionicons name="reorder-three" size={18} color="#C7C7CC" />
            </TouchableOpacity>
            <Text style={[styles.manageGroupText, item.id === 'default' && {color: '#8E8E93', fontStyle:'italic'}]}>
              {item.name}
            </Text>
          </View>
          {item.id !== 'default' && (
            <TouchableOpacity onPress={() => handleDelete(item)} style={styles.manageDeleteBtn}>
              <Ionicons name="trash-outline" size={18} color="#FF3B30"/>
            </TouchableOpacity>
          )}
        </View>
      </OpacityDecorator>
    </ScaleDecorator>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* 在 Android 上，Modal 是顶层原生视图。
        react-native-gesture-handler 需要 GestureHandlerRootView 包裹内容才能在 Modal 内部捕捉手势 
      */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={{width: 40}} />
            <Text style={styles.modalTitle}>管理分组</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color="#8E8E93"/>
            </TouchableOpacity>
          </View>
          {isAdding ? (
            <View style={styles.addGroupCard}>
              <TextInput 
                style={styles.addInput} 
                placeholder="输入分组名称" 
                placeholderTextColor="#C7C7CC"
                autoFocus 
                value={newGroupName} 
                onChangeText={setNewGroupName}
                onSubmitEditing={handleAdd}
              />
              <View style={styles.addActionRow}>
                <TouchableOpacity onPress={() => { setIsAdding(false); setNewGroupName(''); }} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAdd} style={styles.confirmAddBtn}>
                  <Text style={styles.confirmAddBtnText}>确定</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addBtnCard} onPress={() => setIsAdding(true)}>
              <Ionicons name="add-circle" size={24} color="#007AFF"/>
              <Text style={styles.addBtnText}>新建分组</Text>
            </TouchableOpacity>
          )}
          <DraggableFlatList
            data={localGroups}
            onDragEnd={handleDragEnd}
            keyExtractor={item => item.id.toString()}
            renderItem={renderItem}
            contentContainerStyle={styles.manageGroupList}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

// ==========================================
// 2. 目标卡片组件
// ==========================================
const GoalCardItem = ({ goal, allGoals, refreshFn, drag, isActive, stats, checkIns, isExpanded, onToggleExpand, onRecordPress, onStartDateEdit, onEditFreq }) => {
  const swipeableRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(goal.name);

  // 【已删除】isPinned 变量

  // 提取统计数据
  const goalStat = stats?.goalStats?.find(s => String(s.goalId) === String(goal.id)) || { totalDays: 0, checkInsByDate: {} };
  const historyRecords = checkIns.filter(ci => String(ci.goal_id || ci.goalId) === String(goal.id));
   
  // 解析配置
  const config = parseGoalConfig(goal);
  const goalType = getGoalTypeCategory(goal); // 1=固定, 2=自由, 3=频次
  const isCountMode = goalType === 3;

  let expandIconName = "calendar"; 
  if (goalType === 3) {
      expandIconName = "repeat";
  } else if (goalType === 2) {
      expandIconName = "infinite";
  } else {
      expandIconName = "calendar";
  }

  const getSummary = () => {
    try {
      if (goal.repeat_type === 'daily') return '每天';
      if (goal.repeat_type === 'flexible') return '自由打卡';
      
      if (goal.repeat_type === 'weekly') {
        if (config.mode === 'count') return `每周 ${config.count} 次`;
        if (config.days && Array.isArray(config.days)) {
          const dayMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
          const sorted = [...config.days].sort((a,b)=>a-b);
          if(sorted.length === 7) return '每天';
          const text = '每周 ' + sorted.map(d => dayMap[d]).join('、');
          return text.length > 20 ? text.substring(0, 19) + '等' : text;
        }
        return '每周';
      }
      
      if (goal.repeat_type === 'monthly') {
        if (config.mode === 'count') return `每月 ${config.count} 次`;
        if (config.days && Array.isArray(config.days)) {
          const sorted = [...config.days].sort((a,b)=>a-b);
          const text = '每月 ' + sorted.join('、') + '号';
          return text.length > 20 ? text.substring(0, 19) + '等' : text;
        }
        return '每月';
      }
      
      if (goal.repeat_type === 'yearly') {
        if (config.mode === 'count') return `每年 ${config.count} 次`;
        if (config.dates && Array.isArray(config.dates)) {
          const text = '每年 ' + config.dates.map(d => {
              const [m, day] = d.split('-');
              return `${parseInt(m)}月${parseInt(day)}日`;
          }).join('、');
          return text.length > 20 ? text.substring(0, 19) + '等' : text;
        }
        return '每年';
      }
      
      if (goal.repeat_type === 'custom') {
        if (config.dates && Array.isArray(config.dates)) {
           return `自定义 (${config.dates.length}天)`;
        }
        return '自定义';
      }
      return '定期';
    } catch (e) { return '定期'; }
  };

  const closeSwipe = () => swipeableRef.current?.close();

  const handleSaveName = async () => {
    const trimmed = tempName.trim();
    if (trimmed === '') {
        setTempName(goal.name);
        setIsEditing(false);
        return;
    }
    const isDuplicate = allGoals.some(g => g.id !== goal.id && g.name === trimmed);
    if (isDuplicate) {
        Alert.alert('提示', '任务名称已存在');
        return;
    }

    if (trimmed !== goal.name) {
      await updateGoal(goal.id, { name: trimmed });
      refreshFn();
    }
    setIsEditing(false);
  };

  const renderRightActions = () => (
    <View style={styles.rightActionsContainer}>
      {/* 【已删除】置顶按钮 */}

      <RectButton
        style={[styles.circleActionBtn, { backgroundColor: '#FF9500' }]}
        onPress={async () => {
          closeSwipe();
          await updateGoal(goal.id, { is_hidden: !goal.is_hidden });
          refreshFn();
        }}>
        <Ionicons name={goal.is_hidden ? "eye" : "eye-off"} size={20} color="#fff" />
      </RectButton>

      <RectButton
        style={[styles.circleActionBtn, { backgroundColor: '#FF3B30' }]}
        onPress={() => {
          closeSwipe();
          Alert.alert('删除', '确认删除?', [
            { text: '删除', style: 'destructive', onPress: async () => { await deleteGoal(goal.id); refreshFn(); } },
            { text: '取消' }
          ]);
        }}>
        <Ionicons name="trash-outline" size={20} color="#fff" />
      </RectButton>
    </View>
  );

  return (
    <ScaleDecorator>
      <OpacityDecorator activeOpacity={1}>
        <View style={[styles.cardContainer, isActive && styles.activeCard]}>
          <Swipeable 
            ref={swipeableRef} 
            renderRightActions={renderRightActions} 
            rightThreshold={40}
            enabled={!isActive && !isEditing}
          >
            <View style={styles.cardHeaderWrapper}>
              <TouchableOpacity 
                style={styles.infoArea}
                activeOpacity={1}
                onPress={() => onToggleExpand(goal.id)}
                disabled={isActive}
              >
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <TouchableOpacity 
                      onLongPress={drag} 
                      delayLongPress={50}
                      hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}
                      style={styles.dragHandle}
                      disabled={isActive}
                    >
                      <Ionicons name="reorder-two" size={16} color="#E5E5EA" />
                    </TouchableOpacity>

                    {isEditing ? (
                      <View style={{flexDirection:'row', alignItems:'center', flex:1}}>
                        <TextInput 
                            value={tempName} 
                            onChangeText={setTempName} 
                            style={styles.inlineInput} 
                            autoFocus 
                            maxLength={10} 
                            onBlur={handleSaveName} 
                            onSubmitEditing={handleSaveName}
                        />
                        <TouchableOpacity onPress={handleSaveName} style={{marginRight: 16}}>
                            <Ionicons name="checkmark" size={18} color="#007AFF" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{flex:1}}>
                        <TouchableOpacity onPress={() => setIsEditing(true)} disabled={isActive} onLongPress={drag}>
                          <Text style={[styles.goalName, goal.is_hidden && {color:'#ccc', textDecorationLine:'line-through'}]} numberOfLines={1}>
                            {goal.name}
                          </Text>
                        </TouchableOpacity>
                        
                        {/* 频率修改入口 */}
                        <TouchableOpacity 
                            onPress={() => onEditFreq(goal)}
                            hitSlop={{top: 5, bottom: 5, right: 20}}
                        >
                            <Text style={styles.goalFreq}>{getSummary()}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.expandBtn} 
                onPress={() => onToggleExpand(goal.id)}
                hitSlop={{top:10, bottom:10, left:10, right:10}}
              >
                  <View style={{alignItems: 'flex-end'}}>
                    {/* 【已删除】置顶的小红旗图标 */}
                    <Ionicons 
                        name={isExpanded ? expandIconName : `${expandIconName}-outline`} 
                        size={20} 
                        color={isExpanded ? "#007AFF" : "#C7C7CC"} 
                    />
                  </View>
              </TouchableOpacity>
            </View>
          </Swipeable>

          {isExpanded && (
            <View style={styles.detailsWrapper}>
              <View style={styles.divider} />
              
              {/* Type 1 固定日期才显示修改起始日的入口 (Type 2, 3 不显示) */}
              {goalType === 1 && (
                <View style={styles.toolsRow}>
                    <TouchableOpacity onPress={() => onStartDateEdit(goal)} style={styles.toolBtn}>
                        <Ionicons name="calendar-outline" size={12} color="#8E8E93" />
                        <Text style={styles.toolText}>起始日: {format(new Date(goal.start_date || goal.created_at), 'yyyy-MM-dd')}</Text>
                    </TouchableOpacity>
                </View>
              )}

              <View style={styles.contentArea}>
                <GoalCalendar 
                  goal={goal} 
                  checkInsByDate={goalStat.checkInsByDate || {}} 
                  historyRecords={historyRecords} 
                  onRecordPress={onRecordPress} 
                />
                
                {/* 仅固定时间(Type 1)显示未完成/待办，Count模式和自由模式逻辑不同 */}
                {goalType === 1 && (
                  <View style={styles.legendContainer}>
                    <View style={styles.legendItem}><Ionicons name="checkmark" size={12} color="#34C759"/><Text style={styles.legendText}>已完成</Text></View>
                    <View style={styles.legendItem}><Ionicons name="close" size={12} color="#FF3B30"/><Text style={styles.legendText}>未完成</Text></View>
                    <View style={styles.legendItem}><View style={[styles.statusDot, {borderColor:'#8E8E93', backgroundColor:'#fff'}]} /><Text style={styles.legendText}>待办</Text></View>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </OpacityDecorator>
    </ScaleDecorator>
  );
};

// ==========================================
// 3. 分组标题组件
// ==========================================
const GroupHeaderItem = ({ group, isExpanded, onToggle, count }) => {
  return (
    <TouchableOpacity 
      style={styles.groupHeader} 
      onPress={() => onToggle(group.id)} 
      activeOpacity={0.8}
    >
      <View style={{flexDirection:'row', alignItems:'center'}}>
        <Ionicons name={isExpanded ? "chevron-down" : "chevron-forward"} size={16} color="#666" style={{marginRight:6}} />
        <Text style={styles.groupTitle}>{group.name}</Text>
        <Text style={styles.groupCount}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
};

// ==========================================
// 4. 主页面
// ==========================================
export default function CheckInScreen() {
  const navigation = useNavigation();
  const { goals, stats, checkIns, groups: contextGroups, refreshData } = useCheckIn();
  const [groups, setGroups] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({}); 
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [flatData, setFlatData] = useState([]);
   
  const [expandedGoalId, setExpandedGoalId] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
   
  // --- Start Date Edit State ---
  const [editingGoal, setEditingGoal] = useState(null);
  const [tempDate, setTempDate] = useState(new Date());
  const [showDateEditModal, setShowDateEditModal] = useState(false); 
  const [showNativeDatePicker, setShowNativeDatePicker] = useState(false);

  // --- Frequency Edit State (区分不同类型) ---
  const [editFreqModalVisible, setEditFreqModalVisible] = useState(false);
  const [editingGoalFreq, setEditingGoalFreq] = useState(null);
  const [editingGoalType, setEditingGoalType] = useState(1); // 1=Fixed, 3=Count (2 cannot edit)
   
  const [tempRepeatType, setTempRepeatType] = useState('daily');
  const [tempWeekDays, setTempWeekDays] = useState([]); 
  const [tempMonthDays, setTempMonthDays] = useState(''); 
  const [tempYearDates, setTempYearDates] = useState([]); 
  const [tempCustomDates, setTempCustomDates] = useState([]);
  const [tempCount, setTempCount] = useState('1'); // for Type 3

  // 频率配置里 添加日期 的临时值
  const [freqPickerDate, setFreqPickerDate] = useState(new Date());
  const [showFreqDatePicker, setShowFreqDatePicker] = useState(false); // 控制器
  const [freqDatePickerMode, setFreqDatePickerMode] = useState('year'); // 'year' or 'custom'

  const flatListRef = useRef(null);

  const fetchGroups = async () => {
    try {
      const apiGroups = await getGroups();
      let savedSortOrder = [];
      let savedExpandState = {}; 

      try {
        const savedSort = await AsyncStorage.getItem(GROUP_SORT_ORDER_KEY);
        if (savedSort) savedSortOrder = JSON.parse(savedSort);
        const savedExpand = await AsyncStorage.getItem(GROUP_EXPAND_STATE_KEY);
        if (savedExpand) savedExpandState = JSON.parse(savedExpand);
      } catch (e) {}
      
      const defaultGroup = { id: 'default', name: '默认分组', isVirtual: true };
      let allGroups = [defaultGroup, ...apiGroups];

      if (savedSortOrder.length > 0) {
        const sorted = [];
        savedSortOrder.forEach(id => {
          const found = allGroups.find(g => String(g.id) === String(id));
          if (found) sorted.push(found);
        });
        allGroups.forEach(g => {
          if (!savedSortOrder.includes(String(g.id))) sorted.push(g);
        });
        allGroups = sorted;
      }

      setGroups(allGroups);
      
      if (Object.keys(savedExpandState).length > 0) {
          const newExpandState = { ...savedExpandState };
          allGroups.forEach(g => {
              if (newExpandState[g.id] === undefined) newExpandState[g.id] = true;
          });
          setExpandedGroups(newExpandState);
      } else {
          const initialExpand = {};
          allGroups.forEach(g => initialExpand[g.id] = true);
          setExpandedGroups(initialExpand);
      }
    } catch (e) { console.log(e); }
  };

  useEffect(() => {
    if (contextGroups && contextGroups.length > 0) {
      const defaultGroup = { id: 'default', name: '默认分组', isVirtual: true };
      const allGroups = [defaultGroup, ...contextGroups];
      setGroups(allGroups);
    }
  }, [contextGroups]);

  useFocusEffect(useCallback(() => {
    refreshData();
    fetchGroups();
  }, []));

  useEffect(() => {
    if (!groups || !goals) return;

    const newFlatData = [];

    groups.forEach(group => {
      newFlatData.push({ 
        type: 'header', 
        id: `header-${group.id}`, 
        groupId: group.id, 
        name: group.name, 
        isExpanded: !!expandedGroups[group.id] 
      });
      
      if (expandedGroups[group.id]) {
        let groupGoals = [];
        if (group.id === 'default') {
          groupGoals = goals.filter(g => !g.group_id);
        } else {
          groupGoals = goals.filter(g => String(g.group_id) === String(group.id));
        }

        const filteredGoals = groupGoals.filter(g => showHidden || !g.is_hidden).sort((a,b) => {
          // 【已修改】移除了置顶优先的排序逻辑
          return (a.sort_order - b.sort_order);
        });
        
        filteredGoals.forEach(g => newFlatData.push({ type: 'goal', ...g }));
      }
    });

    setFlatData(newFlatData);
  }, [goals, groups, expandedGroups, showHidden]);

  const handleGroupLocalReorder = async (newGroupList) => {
    setGroups(newGroupList); 
    const newOrderIds = newGroupList.map(g => String(g.id));
    try {
      await AsyncStorage.setItem(GROUP_SORT_ORDER_KEY, JSON.stringify(newOrderIds));
    } catch (e) {}
  };

  const toggleGroupExpand = async (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedGroups(prev => {
        const next = { ...prev, [id]: !prev[id] };
        AsyncStorage.setItem(GROUP_EXPAND_STATE_KEY, JSON.stringify(next)).catch(e=>{});
        return next;
    });
  };

  const toggleGoalExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedGoalId(prev => prev === id ? null : id);
  };

  // --- Start Date Edit Logic ---
  const openStartDatePicker = (goal) => {
    setEditingGoal(goal);
    setTempDate(new Date(goal.start_date || goal.created_at));
    
    if (Platform.OS === 'ios') {
      setShowDateEditModal(true);
    } else {
      setShowNativeDatePicker(true);
    }
  };

  const formatDateToLocalString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return new Date(year, date.getMonth(), day, 12, 0, 0).toISOString();
  };

  const handleConfirmStartDateIOS = async () => {
    if (editingGoal) {
      await updateGoal(editingGoal.id, { start_date: formatDateToLocalString(tempDate) });
      refreshData();
    }
    setShowDateEditModal(false);
  };

  const handleNativeStartDateChange = (event, selectedDate) => {
    setShowNativeDatePicker(false);
    if (event.type === 'set' && selectedDate && editingGoal) {
        updateGoal(editingGoal.id, { start_date: formatDateToLocalString(selectedDate) }).then(() => {
          refreshData();
        });
    }
  };

  // --- Frequency Edit Logic ---
  const openFreqEditor = (goal) => {
    const type = getGoalTypeCategory(goal);

    if (type === 2) {
      Alert.alert('提示', '自由打卡目标无需设置频率');
      return;
    }

    setEditingGoalFreq(goal);
    setEditingGoalType(type); // 1 or 3
    setTempRepeatType(goal.repeat_type || 'daily');
    
    // Parse existing config to populate UI
    const config = parseGoalConfig(goal);
    
    // Default values
    setTempWeekDays([]);
    setTempMonthDays('');
    setTempYearDates([]);
    setTempCustomDates([]);
    setTempCount('1');

    if (type === 3) {
        // Count Mode Logic
        if (config.count) setTempCount(String(config.count));
        // Count mode also usually has weekly/monthly/yearly type
    } else {
        // Fixed Mode Logic
        if (goal.repeat_type === 'weekly' && config.days) {
            setTempWeekDays(config.days);
        } else if (goal.repeat_type === 'monthly' && config.days) {
            setTempMonthDays(config.days.join(', '));
        } else if (goal.repeat_type === 'yearly' && config.dates) {
            setTempYearDates(config.dates);
        } else if (goal.repeat_type === 'custom' && config.dates) {
            setTempCustomDates(config.dates);
        }
    }

    setEditFreqModalVisible(true);
  };

  const handleSaveFreq = async () => {
    if (!editingGoalFreq) return;
    
    let repeatConfig = {};
    
    // Type 3: Count Mode Logic
    if (editingGoalType === 3) {
        const countVal = parseInt(tempCount);
        if (isNaN(countVal) || countVal < 1) {
             return Alert.alert('提示', '请输入有效的次数');
        }
        repeatConfig = { mode: 'count', count: countVal };
        // Type 3 only allows weekly/monthly/yearly
    } 
    // Type 1: Fixed Mode Logic
    else {
        if (tempRepeatType === 'weekly') {
          if (tempWeekDays.length === 0) return Alert.alert('提示', '请至少选择一天');
          repeatConfig = { days: tempWeekDays.sort() };
        } 
        else if (tempRepeatType === 'monthly') {
          const days = tempMonthDays.split(/[,，\s]+/).map(d => parseInt(d)).filter(d => !isNaN(d) && d >= 1 && d <= 31);
          if (days.length === 0) return Alert.alert('提示', '请输入有效的日期 (1-31)');
          repeatConfig = { days: [...new Set(days)].sort((a,b)=>a-b) };
        } 
        else if (tempRepeatType === 'yearly') {
          if (tempYearDates.length === 0) return Alert.alert('提示', '请至少添加一个日期');
          repeatConfig = { dates: tempYearDates };
        } 
        else if (tempRepeatType === 'custom') {
          if (tempCustomDates.length === 0) return Alert.alert('提示', '请至少添加一个具体日期');
          repeatConfig = { dates: tempCustomDates };
        }
    }

    try {
      // 核心修改：移除 JSON.stringify，直接传对象，让 fetch 自动处理
      // 确保字段名和后端对应：repeat_type, repeat_config
      await updateGoal(editingGoalFreq.id, {
        repeat_type: tempRepeatType,
        repeat_config: repeatConfig 
      });
      
      refreshData();
      setEditFreqModalVisible(false);
    } catch (e) {
      Alert.alert('更新失败', e.message);
    }
  };

  // 确认添加日期 (Type 1 specific)
  const confirmFreqDate = () => {
      const selectedDate = freqPickerDate;
      setShowFreqDatePicker(false);
      if (!selectedDate) return;

      const y = selectedDate.getFullYear();
      const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const d = String(selectedDate.getDate()).padStart(2, '0');
      
      if (freqDatePickerMode === 'year') {
        const str = `${m}-${d}`;
        if (!tempYearDates.includes(str)) setTempYearDates([...tempYearDates, str].sort());
      } else {
        const str = `${y}-${m}-${d}`;
        if (!tempCustomDates.includes(str)) setTempCustomDates([...tempCustomDates, str].sort());
      }
  };

  // --- UI Helpers for Freq Editor ---
  const renderWeekSelector = () => {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return (
      <View style={styles.weekContainer}>
        {days.map((d, index) => {
          const selected = tempWeekDays.includes(index);
          return (
            <TouchableOpacity
              key={index}
              style={[styles.weekBtn, selected && styles.weekBtnSelected]}
              onPress={() => setTempWeekDays(prev => selected ? prev.filter(i => i !== index) : [...prev, index])}
            >
              <Text style={[styles.weekText, selected && styles.weekTextSelected]}>{d}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

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
          setFreqDatePickerMode(isYearly ? 'year' : 'custom');
          setFreqPickerDate(new Date()); // 重置为今天
          setShowFreqDatePicker(true);
        }}
      >
        <Ionicons name="add" size={16} color="#4A90E2" />
        <Text style={{color:'#4A90E2', fontSize:12}}>添加</Text>
      </TouchableOpacity>
    </View>
  );
   
  // 渲染频率类型切换 Tab (根据 Goal Type 动态显示)
  const renderTypeTabs = () => {
      let options = [];
      if (editingGoalType === 1) {
          // Fixed Mode: Daily, Weekly, Monthly, Yearly, Custom
          options = [
             { id: 'daily', label: '每天' },
             { id: 'weekly', label: '每周' },
             { id: 'monthly', label: '每月' },
             { id: 'yearly', label: '每年' },
             { id: 'custom', label: '自定义' }
          ];
      } else if (editingGoalType === 3) {
          // Count Mode: Weekly, Monthly, Yearly (Count)
          options = [
             { id: 'weekly', label: '每周' },
             { id: 'monthly', label: '每月' },
             { id: 'yearly', label: '每年' },
          ];
      }

      return (
          <View style={styles.typeRow}>
             {options.map(type => (
                <TouchableOpacity
                   key={type.id}
                   style={[styles.typeBtn, tempRepeatType === type.id && styles.typeBtnSelected]}
                   onPress={() => setTempRepeatType(type.id)}
                >
                   <Text style={[styles.typeText, tempRepeatType === type.id && styles.typeTextSelected]}>
                      {type.label}
                   </Text>
                </TouchableOpacity>
             ))}
          </View>
      );
  };

  // --- Main Render ---
   
  const handleDeleteGroupWithTasks = async (groupId, mode) => {
      try {
          if (mode === 'only_group') {
             const groupGoals = goals.filter(g => String(g.group_id) === String(groupId));
             for (const g of groupGoals) {
                 await updateGoal(g.id, { group_id: null });
             }
             await deleteGroup(groupId);
          } else if (mode === 'all') {
             const groupGoals = goals.filter(g => String(g.group_id) === String(groupId));
             for (const g of groupGoals) {
                 await deleteGoal(g.id);
             }
             await deleteGroup(groupId);
          }
          fetchGroups();
          refreshData();
      } catch (e) {
          Alert.alert('错误', '操作失败，请重试');
      }
  };

  const onDragEnd = async ({ data }) => {
    setFlatData(data);
    let currentGroupId = null;
    const updates = []; 
    let currentOrderIndex = 0;

    for (const item of data) {
      if (item.type === 'header') {
        currentGroupId = item.groupId === 'default' ? null : item.groupId;
        currentOrderIndex = 0;
      } else if (item.type === 'goal') {
        const newGroupId = currentGroupId;
        const oldGroupId = item.group_id === null ? 'default' : String(item.group_id);
        if (String(newGroupId) !== oldGroupId || item.sort_order !== currentOrderIndex) {
          updates.push({
            id: item.id,
            group_id: newGroupId, 
            sort_order: currentOrderIndex
          });
        }
        currentOrderIndex++;
      }
    }

    try {
      if (updates.length > 0) await reorderGoals(updates);
      refreshData();
    } catch (e) {
      Alert.alert("同步失败", "请检查网络");
      refreshData(); 
    }
  };

  const renderItem = ({ item, drag, isActive }) => {
    if (item.type === 'header') {
      let count = 0;
      if (item.groupId === 'default') {
        count = goals.filter(g => !g.group_id && (showHidden || !g.is_hidden)).length;
      } else {
        count = goals.filter(g => String(g.group_id) === String(item.groupId) && (showHidden || !g.is_hidden)).length;
      }
      return (
        <GroupHeaderItem 
          group={{id: item.groupId, name: item.name}} 
          isExpanded={item.isExpanded} 
          onToggle={toggleGroupExpand}
          count={count}
        />
      );
    } else {
      return (
        <GoalCardItem 
          goal={item} 
          allGoals={goals}
          refreshFn={refreshData} 
          drag={drag}
          isActive={isActive}
          stats={stats}
          checkIns={checkIns}
          isExpanded={expandedGoalId === item.id}
          onToggleExpand={toggleGoalExpand}
          onRecordPress={(r)=>{setSelectedRecord(r); setDetailModalVisible(true);}}
          onStartDateEdit={openStartDatePicker}
          onEditFreq={openFreqEditor}
        />
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
       
      <View style={styles.navBar}>
        <TouchableOpacity 
          style={styles.navBtn} 
          onPress={() => setManageModalVisible(true)}
          hitSlop={{top:10, bottom:10, left:10, right:10}}
        >
          <Ionicons name="layers-outline" size={26} color="#007AFF" />
        </TouchableOpacity>


        <View style={styles.navRightActions}>
          <TouchableOpacity 
            style={[styles.navBtn, { marginRight: 12 }]} 
            onPress={() => setShowHidden(!showHidden)}
          >
            <Ionicons 
              name={showHidden ? "eye" : "eye-off-outline"} 
              size={26} 
              color={showHidden ? "#007AFF" : "#8E8E93"} 
            />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => navigation.navigate('CreateGoal')}
            style={styles.navBtn}
          >
              <Ionicons name="add" size={30} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      <DraggableFlatList
        ref={(ref) => { if (ref) flatListRef.current = ref; }}
        data={flatData}
        onDragEnd={onDragEnd}
        keyExtractor={(item) => item.type === 'header' ? item.id : `goal-${item.id}`}
        renderItem={renderItem}
        contentContainerStyle={styles.contentContainer}
        activationDistance={10}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={() => <View style={{height: 100}} />}
        autoscrollThreshold={100}
        autoscrollSpeed={50}
      />

      <GroupManageModal 
        visible={manageModalVisible} 
        onClose={() => setManageModalVisible(false)} 
        groups={groups}
        onUpdateGroups={fetchGroups}
        onLocalReorder={handleGroupLocalReorder}
        onDeleteGroupWithTasks={handleDeleteGroupWithTasks}
      />

      {/* 详情弹窗 */}
      <Modal visible={detailModalVisible} transparent animationType="fade" onRequestClose={() => setDetailModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDetailModalVisible(false)}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              {selectedRecord && (
                <>
                  <View style={styles.detailModalHeader}>
                    <Text style={styles.detailModalTitle}>{format(new Date(selectedRecord.checkin_date || selectedRecord.date), 'MM月dd日 HH:mm', { locale: zhCN })}</Text>
                    <TouchableOpacity onPress={() => setDetailModalVisible(false)}><Ionicons name="close" size={24} color="#8E8E93" /></TouchableOpacity>
                  </View>
                  <View style={styles.detailModalBody}>
                    {selectedRecord.image ? <Image source={{ uri: selectedRecord.image }} style={styles.recordImage} resizeMode="cover" /> : null}
                    <View style={styles.noteBox}><Text style={styles.noteLabel}>备注</Text><Text style={styles.noteText}>{selectedRecord.note || '无'}</Text></View>
                  </View>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* --- 日期修改弹窗 (Start Date) --- */}
      <Modal visible={showDateEditModal} transparent animationType="slide" onRequestClose={() => setShowDateEditModal(false)}>
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowDateEditModal(false)}
        >
          <TouchableWithoutFeedback>
            <View style={styles.confirmModalContent}>
              <View style={styles.confirmModalHeader}>
                <Text style={styles.confirmModalTitle}>修改起始日期</Text>
                <TouchableOpacity onPress={() => setShowDateEditModal(false)}>
                  <Ionicons name="close" size={24} color="#8E8E93" />
                </TouchableOpacity>
              </View>
              
              <View style={{ height: 200, justifyContent: 'center' }}>
                  <DateTimePicker 
                    value={tempDate} 
                    mode="date" 
                    display="spinner" 
                    onChange={(e, d) => d && setTempDate(d)} 
                    locale="zh-CN"
                    maximumDate={new Date()}
                  />
              </View>

              <View style={styles.confirmModalActions}>
                <TouchableOpacity 
                  style={styles.confirmCancelBtn} 
                  onPress={() => setShowDateEditModal(false)}
                >
                  <Text style={styles.confirmCancelBtnText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.confirmOkBtn} 
                  onPress={handleConfirmStartDateIOS}
                >
                  <Text style={styles.confirmOkBtnText}>确定修改</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* --- Android 原生 DatePicker (Start Date) --- */}
      {showNativeDatePicker && (
        <DateTimePicker 
          value={tempDate} 
          mode="date" 
          display="default" 
          maximumDate={new Date()}
          onChange={handleNativeStartDateChange} 
        />
      )}

      {/* --- 频率配置修改弹窗 (核心修复：iOS Inline DatePicker) --- */}
      <Modal visible={editFreqModalVisible} transparent animationType="slide" onRequestClose={() => setEditFreqModalVisible(false)}>
         <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setEditFreqModalVisible(false)}
         >
            <TouchableWithoutFeedback>
               <View style={styles.confirmModalContent}>
                  <View style={styles.confirmModalHeader}>
                     <Text style={styles.confirmModalTitle}>修改打卡频率</Text>
                     <TouchableOpacity onPress={() => setEditFreqModalVisible(false)}>
                        <Ionicons name="close" size={24} color="#8E8E93" />
                     </TouchableOpacity>
                  </View>

                  {/* 如果不在显示日期选择器，则显示常规配置 */}
                  {!showFreqDatePicker ? (
                    <>
                      {renderTypeTabs()}
                      <View style={styles.configArea}>
                         {/* 频次配置 (Type 3) */}
                         {editingGoalType === 3 && (
                             <View>
                                <Text style={styles.subLabel}>设置目标次数：</Text>
                                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                    <TextInput
                                        style={[styles.input, {width: 60, textAlign: 'center'}]}
                                        value={tempCount}
                                        onChangeText={setTempCount}
                                        keyboardType="numeric"
                                    />
                                    <Text style={{marginLeft: 10, fontSize: 14, color: '#333'}}>次</Text>
                                </View>
                             </View>
                         )}

                         {/* 固定配置 (Type 1) */}
                         {editingGoalType === 1 && (
                           <>
                             {tempRepeatType === 'weekly' && (
                                <View>
                                   <Text style={styles.subLabel}>选择需要打卡的星期：</Text>
                                   {renderWeekSelector()}
                                </View>
                             )}
                             {tempRepeatType === 'monthly' && (
                                <View>
                                   <Text style={styles.subLabel}>输入每月几号 (用逗号分隔)：</Text>
                                   <TextInput
                                      style={styles.input}
                                      placeholder="例如: 1, 15, 25"
                                      keyboardType="numeric"
                                      value={tempMonthDays}
                                      onChangeText={setTempMonthDays}
                                   />
                                </View>
                             )}
                             {tempRepeatType === 'yearly' && (
                                <View>
                                   <Text style={styles.subLabel}>每年固定日期 (忽略年份)：</Text>
                                   {renderDateTags(tempYearDates, setTempYearDates, true)}
                                </View>
                             )}
                             {tempRepeatType === 'custom' && (
                                <View>
                                   <Text style={styles.subLabel}>具体打卡日期 (年月日)：</Text>
                                   {renderDateTags(tempCustomDates, setTempCustomDates, false)}
                                </View>
                             )}
                           </>
                         )}
                      </View>

                      <View style={[styles.confirmModalActions, {marginTop: 20}]}>
                         <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setEditFreqModalVisible(false)}>
                            <Text style={styles.confirmCancelBtnText}>取消</Text>
                         </TouchableOpacity>
                         <TouchableOpacity style={styles.confirmOkBtn} onPress={handleSaveFreq}>
                            <Text style={styles.confirmOkBtnText}>保存配置</Text>
                         </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    /* iOS Date Picker 嵌入显示 (Inline)，防止被遮挡 */
                    Platform.OS === 'ios' && (
                      <View style={{alignItems: 'center', paddingVertical: 10}}>
                        <Text style={{fontSize: 16, fontWeight: '600', marginBottom: 10}}>选择日期</Text>
                        <DateTimePicker
                            value={freqPickerDate}
                            mode="date"
                            display="spinner"
                            locale="zh-CN"
                            onChange={(e, d) => d && setFreqPickerDate(d)}
                            style={{width: 300, height: 200}}
                        />
                        <View style={[styles.confirmModalActions, {marginTop: 10, width: '100%'}]}>
                           <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setShowFreqDatePicker(false)}>
                              <Text style={styles.confirmCancelBtnText}>返回</Text>
                           </TouchableOpacity>
                           <TouchableOpacity style={styles.confirmOkBtn} onPress={confirmFreqDate}>
                              <Text style={styles.confirmOkBtnText}>确定</Text>
                           </TouchableOpacity>
                        </View>
                      </View>
                    )
                  )}
               </View>
            </TouchableWithoutFeedback>
         </TouchableOpacity>
      </Modal>

      {/* --- Android DatePicker 保持在根节点 (原生无遮挡问题) --- */}
      {showFreqDatePicker && Platform.OS === 'android' && (
          <DateTimePicker
             value={freqPickerDate}
             mode="date"
             display="default"
             onChange={(e, d) => {
                 if (e.type === 'set' && d) {
                     setFreqPickerDate(d);
                     setTimeout(() => {
                         setShowFreqDatePicker(false);
                         const selectedDate = d;
                         const y = selectedDate.getFullYear();
                         const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
                         const day = String(selectedDate.getDate()).padStart(2, '0');
                         
                         if (freqDatePickerMode === 'year') {
                           const str = `${m}-${day}`;
                           if (!tempYearDates.includes(str)) setTempYearDates([...tempYearDates, str].sort());
                         } else {
                           const str = `${y}-${m}-${day}`;
                           if (!tempCustomDates.includes(str)) setTempCustomDates([...tempCustomDates, str].sort());
                         }
                     }, 50);
                 } else {
                     setShowFreqDatePicker(false);
                 }
             }}
          />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { paddingBottom: 100, paddingHorizontal: 16, paddingTop: 10 }, 

  // === 顶部导航栏 ===
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: '#fff', 
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 10,
    marginBottom: 10, 
  },
  navTitleContainer: {
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  navTitle: {
    fontSize: 20, 
    fontWeight: '700', 
    color: '#000',
  },
  navBtn: { padding: 4, justifyContent: 'center', alignItems: 'center' },
  navRightActions: { flexDirection: 'row', alignItems: 'center' },

  // Group Styles
  groupHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 12, 
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  groupTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginLeft: 8 }, 
  groupCount: { fontSize: 12, color: '#8E8E93', marginLeft: 8, backgroundColor: '#E5E5EA', paddingHorizontal: 6, borderRadius: 4, overflow:'hidden' },
  
  // Card Styles
  cardContainer: { 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    marginBottom: 12, 
    overflow: 'hidden',
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 6, 
    elevation: 2 
  },
  activeCard: {
    backgroundColor: '#eef6ff',
    elevation: 5,
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHeaderWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  infoArea: {
      flex: 1,
      justifyContent: 'center',
      paddingLeft: 4,
  },
  expandBtn: {
      padding: 12,
      marginLeft: 4,
  },
  dragHandle: { paddingRight: 8, justifyContent: 'center' },
  goalName: { fontSize: 17, fontWeight: '600', color: '#000', marginBottom: 2 },
  goalFreq: { fontSize: 12, color: '#8E8E93', marginTop: 6 },
  inlineInput: { 
      fontSize: 16, 
      fontWeight: '500', 
      color: '#000', 
      borderBottomWidth: 1, 
      borderBottomColor: '#007AFF', 
      padding: 0, 
      flex: 0, 
      width: 140, 
      marginRight: 8 
  },

  // Expanded Details
  detailsWrapper: { backgroundColor: '#fff', paddingBottom: 16 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5EA', marginHorizontal: 16 },
  contentArea: { paddingHorizontal: 16, paddingTop: 16 },
  toolsRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8, marginBottom: -8 },
  toolBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  toolText: { fontSize: 10, color: '#8E8E93', marginLeft: 4 },

  // Swipe Actions
  rightActionsContainer: {
    width: 130, // 【已修改】减少了宽度，因为少了一个按钮
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 16,
  },
  circleActionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24, 
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },

  // === Calendar Views Styles ===
  viewContainer: { width: '100%' },
  calendarContainer: { width: '100%' },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  calMonth: { fontSize: 15, fontWeight: '600', color: '#333' },
  progressText: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  // Weekly Grid
  weekGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  weekDayItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, marginHorizontal: 2, backgroundColor: '#F9F9F9' },
  weekDayChecked: { backgroundColor: '#34C759' },
  weekDayToday: { borderWidth: 1, borderColor: '#007AFF', backgroundColor: '#fff' },
  weekDayTitle: { fontSize: 12, color: '#8E8E93', marginBottom: 4 },
  weekDayNum: { fontSize: 16, fontWeight: '600', color: '#333' },

  // Yearly Grid
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  miniMonthContainer: { width: '31%', marginBottom: 12, backgroundColor: '#F9F9F9', borderRadius: 8, padding: 4 },
  miniMonthTitle: { fontSize: 10, color: '#666', marginBottom: 4, textAlign: 'center', fontWeight: '600' },
  miniMonthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  miniDay: { width: '14.28%', aspectRatio: 1, marginVertical: 1, borderRadius: 1 },
  miniDayEmpty: { width: '14.28%', aspectRatio: 1 },
  miniDayChecked: { backgroundColor: '#34C759', borderRadius: 2 },

  // Monthly Grid
  calWeekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  calWeekText: { width: 30, textAlign: 'center', color: '#C7C7CC', fontSize: 11 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginVertical: 2, borderRadius: 8, position: 'relative' },
  calDayText: { fontSize: 13, color: '#000', zIndex: 2 },
  statusIconContainer: { position: 'absolute', bottom: 2, right: 2, zIndex: 1 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5, borderWidth: 1 },

  // Legend
  legendContainer: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 11, color: '#8E8E93' },

  // Group Manage Modal Styles
  modalContainer: { flex: 1, backgroundColor: '#F2F2F7', paddingTop: 60, justifyContent: 'flex-start' }, 
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingBottom: 20 
  },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#000', flex: 1, textAlign: 'center' },
  modalCloseBtn: { padding: 8, marginRight: -8, width: 40, alignItems: 'flex-end' },
  
  addGroupCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  addInput: { 
    backgroundColor: '#F2F2F7', 
    borderRadius: 12, 
    padding: 16, 
    fontSize: 16, 
    color: '#000',
    marginBottom: 16
  },
  addActionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 20 },
  cancelBtnText: { color: '#8E8E93', fontSize: 16, fontWeight: '600' },
  confirmAddBtn: { backgroundColor: '#007AFF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  confirmAddBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  
  addBtnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  addBtnText: { color: '#007AFF', fontSize: 17, fontWeight: '600', marginLeft: 8 },
  
  manageGroupList: { paddingHorizontal: 16, paddingBottom: 40 },
  manageGroupCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    marginBottom: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 6, 
    elevation: 2 
  },
  manageGroupContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  manageDragHandle: { paddingRight: 16, justifyContent: 'center' },
  manageGroupText: { fontSize: 17, fontWeight: '600', color: '#000' },
  manageDeleteBtn: { padding: 8, marginLeft: 8 },
  activeDragItem: { backgroundColor: '#eef6ff', elevation: 5, shadowOpacity: 0.1, shadowRadius: 4 },

  // Detail Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', width: '100%', maxWidth: 320, borderRadius: 14, padding: 20 },
  detailModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  detailModalTitle: { fontSize: 17, fontWeight: '600', color: '#000' },
  detailModalBody: { gap: 16 },
  recordImage: { width: '100%', height: 180, borderRadius: 8, backgroundColor: '#F2F2F7' },
  noteBox: { backgroundColor: '#F2F2F7', padding: 12, borderRadius: 8 },
  noteLabel: { fontSize: 12, fontWeight: '600', color: '#8E8E93', marginBottom: 4 },
  noteText: { fontSize: 14, color: '#000', lineHeight: 20 },

  // 确认弹窗样式 (通用)
  confirmModalContent: { 
    backgroundColor: '#fff', 
    width: '100%', 
    maxWidth: 340, 
    borderRadius: 14, 
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    // [修复]: 移除 overflow: hidden 允许内容（如阴影或picker）正常显示，但通常我们会通过布局解决
    // overflow: 'hidden' 
  },
  confirmModalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  confirmModalTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  confirmModalActions: { 
    flexDirection: 'row', 
    justifyContent: 'flex-end', 
    gap: 12 
  },
  confirmCancelBtn: { 
    paddingVertical: 10, 
    paddingHorizontal: 20 
  },
  confirmCancelBtnText: { 
    color: '#8E8E93', 
    fontSize: 16, 
    fontWeight: '600' 
  },
  confirmOkBtn: { 
    backgroundColor: '#007AFF', 
    paddingHorizontal: 24, 
    paddingVertical: 12, 
    borderRadius: 8 
  },
  confirmOkBtnText: { 
    color: '#fff', 
    fontSize: 16, 
    fontWeight: '600' 
  },

  // --- 频率编辑器样式 (复刻 CreateGoalScreen) ---
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  typeBtn: { paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center', borderRadius: 20, backgroundColor: '#f5f5f5', minWidth: '18%' },
  typeBtnSelected: { backgroundColor: '#4A90E2' },
  typeText: { color: '#666', fontSize: 12 },
  typeTextSelected: { color: '#fff', fontWeight: 'bold' },
  configArea: { marginTop: 5, padding: 10, backgroundColor: '#f8f9fa', borderRadius: 8 },
  subLabel: { fontSize: 13, color: '#666', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderRadius: 8, padding: 10, fontSize: 14, color: '#333', borderWidth: 1, borderColor: '#eee' },
  
  weekContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  weekBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#eee' },
  weekBtnSelected: { backgroundColor: '#4A90E2', borderColor: '#4A90E2' },
  weekText: { fontSize: 12, color: '#666' },
  weekTextSelected: { color: '#fff' },
  
  yearTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yearTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef6ff', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 },
  yearTagText: { color: '#4A90E2', fontSize: 13 },
  addYearBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: '#4A90E2', borderStyle: 'dashed' },
});