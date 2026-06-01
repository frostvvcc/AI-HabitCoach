import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Image,
  ScrollView,
  LayoutAnimation,
  Dimensions,
  Platform,
  UIManager,
  Switch
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCheckIn } from '../context/CheckInContext';
import { checkInGoal, getGroups } from '../services/checkInService';
import { 
  format, getDay, getDate, getMonth, startOfWeek, 
  addDays, subDays, isSameDay, isWithinInterval, startOfMonth, startOfYear, endOfWeek, endOfMonth, endOfYear,
  startOfDay, isBefore, isAfter
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

const GROUP_SORT_ORDER_KEY = 'group_sort_order';
const EXPANDED_STATE_KEY = 'home_expanded_groups';
const HIDE_COMPLETED_KEY = 'home_hide_completed';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_GAP = 8;
const CARD_WIDTH = (SCREEN_WIDTH - 32 - (CARD_GAP * 2)) / 3;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const parseGoalConfig = (goal) => {
  try {
    return goal.repeat_config ? (typeof goal.repeat_config === 'string' ? JSON.parse(goal.repeat_config) : goal.repeat_config) : {};
  } catch (e) { return {}; }
};

export default function HomeScreen() {
  const navigation = useNavigation();
  const { goals, checkIns, refreshData } = useCheckIn();
  
  // === 状态管理 ===
  const [selectedDate, setSelectedDate] = useState(new Date()); 
  const [modalVisible, setModalVisible] = useState(false);
  const [activeGoal, setActiveGoal] = useState(null);
  const [note, setNote] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [groups, setGroups] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [hideCompleted, setHideCompleted] = useState(false); 

  // === 日期选择器状态 (新增) ===
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState('start'); // 'start' or 'end'
  const [tempPickerDate, setTempPickerDate] = useState(new Date());

  // === 初始化加载设置 ===
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const hideVal = await AsyncStorage.getItem(HIDE_COMPLETED_KEY);
        if (hideVal !== null) setHideCompleted(JSON.parse(hideVal));
        
        const expandedVal = await AsyncStorage.getItem(EXPANDED_STATE_KEY);
        if (expandedVal !== null) setExpandedGroups(JSON.parse(expandedVal));
      } catch (e) { console.log(e); }
    };
    loadSettings();
  }, []);

  const toggleHideCompleted = async (value) => {
    setHideCompleted(value);
    try {
      await AsyncStorage.setItem(HIDE_COMPLETED_KEY, JSON.stringify(value));
    } catch (e) {}
  };

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 }); 
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }, [selectedDate]);

  // 计算本周的起始和结束日期
  const weekRange = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return { start, end };
  }, [selectedDate]);

  const currentGoals = useMemo(() => {
    if (!goals) return [];
    
    return goals.filter(goal => {
      const config = parseGoalConfig(goal);
      if (goal.repeat_type === 'flexible') return true;
      if (config.mode === 'count') return true;
      if (goal.repeat_type === 'daily') return true;
      
      try {
        if (goal.repeat_type === 'weekly') return config.days?.includes(getDay(selectedDate));
        if (goal.repeat_type === 'monthly') return config.days?.includes(getDate(selectedDate));
        if (goal.repeat_type === 'yearly') {
          const m = String(getMonth(selectedDate) + 1).padStart(2, '0');
          const d = String(getDate(selectedDate)).padStart(2, '0');
          return config.dates?.includes(`${m}-${d}`);
        }
        if (goal.repeat_type === 'custom') {
          return config.dates?.includes(format(selectedDate, 'yyyy-MM-dd'));
        }
      } catch (e) { return false; }
      return false;
    });
  }, [goals, selectedDate]);

  const fetchGroups = async () => {
    try {
      const apiGroups = await getGroups();
      let savedSortOrder = [];
      try {
        const saved = await AsyncStorage.getItem(GROUP_SORT_ORDER_KEY);
        if (saved) savedSortOrder = JSON.parse(saved);
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
      
      const storedExpanded = await AsyncStorage.getItem(EXPANDED_STATE_KEY);
      if (!storedExpanded) {
        const initialExpand = {};
        allGroups.forEach(g => initialExpand[g.id] = true);
        setExpandedGroups(initialExpand);
      }
    } catch (e) { console.log(e); }
  };

  useFocusEffect(useCallback(() => {
    refreshData();
    fetchGroups();
  }, []));

  const getTaskStatus = (goal) => {
    const config = parseGoalConfig(goal);
    const targetDateStr = format(selectedDate, 'yyyy-MM-dd');
    
    const isFrequency = config.mode === 'count';
    const isFlexible = goal.repeat_type === 'flexible';

    const isCheckedToday = checkIns.some(ci => {
      if (String(ci.goal_id || ci.goalId) !== String(goal.id)) return false;
      const d = typeof ci.checkin_date === 'string' ? ci.checkin_date : format(new Date(ci.date), 'yyyy-MM-dd');
      return d.startsWith(targetDateStr);
    });

    let progressText = '';
    let isFull = false;
    const now = selectedDate;

    if (isFrequency) {
      let intervalStart, intervalEnd;
      let periodLabel = '';

      if (goal.repeat_type === 'weekly') {
        intervalStart = startOfWeek(now, { weekStartsOn: 1 });
        intervalEnd = endOfWeek(now, { weekStartsOn: 1 });
        periodLabel = '每周';
      } else if (goal.repeat_type === 'monthly') {
        intervalStart = startOfMonth(now);
        intervalEnd = endOfMonth(now);
        periodLabel = '每月';
      } else if (goal.repeat_type === 'yearly') {
        intervalStart = startOfYear(now);
        intervalEnd = endOfYear(now);
        periodLabel = '每年';
      }

      if (intervalStart && intervalEnd) {
        const count = checkIns.filter(ci => {
          if (String(ci.goal_id || ci.goalId) !== String(goal.id)) return false;
          const d = new Date(ci.checkin_date || ci.date);
          return isWithinInterval(d, { start: intervalStart, end: intervalEnd });
        }).length;
        
        const target = config.count || 1;
        progressText = `${periodLabel} ${count}/${target}`;
        if (count >= target) isFull = true;
      }
    } else {
      const startW = startOfWeek(now, { weekStartsOn: 1 });
      const endW = endOfWeek(now, { weekStartsOn: 1 });
      const countW = checkIns.filter(ci => {
        if (String(ci.goal_id || ci.goalId) !== String(goal.id)) return false;
        const d = new Date(ci.checkin_date || ci.date);
        return isWithinInterval(d, { start: startW, end: endW });
      }).length;
      
      if (isFlexible) {
          progressText = `本周 ${countW} 次`;
      } else if (goal.repeat_type === 'daily') {
          progressText = `本周 ${countW}/7`;
      } else {
          progressText = `本周 ${countW} 次`;
      }
    }

    return {
      isCheckedToday,
      isFull,
      isCompleted: isCheckedToday || isFull,
      progressText,
      typeLabel: isFrequency ? 'freq' : (isFlexible ? 'flex' : 'regular')
    };
  };

  const groupedData = useMemo(() => {
    if (!groups || !goals) return [];

    const result = [];
    groups.forEach(group => {
      let groupGoals = [];
      if (group.id === 'default') {
        groupGoals = goals.filter(g => !g.group_id);
      } else {
        groupGoals = goals.filter(g => String(g.group_id) === String(group.id));
      }

      // 【修复1】这里进行了修改：
      // 我们先计算 filteredGoals 用于显示，但判断是否 push 到 result 时，
      // 只要该分组下有任务（groupGoals.length > 0），就应该显示分组头，防止折叠后消失。
      const visibleGroupGoals = groupGoals.filter(goal => {
        if (goal.is_hidden) return false;
        
        const matchesDate = currentGoals.some(tg => String(tg.id) === String(goal.id));
        if (!matchesDate) return false;

        if (hideCompleted) {
            const status = getTaskStatus(goal);
            if (status.isCompleted) return false;
        }
        return true;
      });

      // 只要分组里有任务（哪怕今天不显示），或者它处于展开状态且有今日任务，都渲染
      // 关键修改：用 groupGoals.length > 0 确保分组存在即显示 Header
      if (groupGoals.length > 0) {
        result.push({
          type: 'group',
          group,
          goals: visibleGroupGoals,
        });
      }
    });

    return result;
  }, [goals, groups, expandedGroups, currentGoals, hideCompleted, checkIns, selectedDate]);

  const toggleGroupExpand = async (groupId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newExpandedState = { ...expandedGroups, [groupId]: !expandedGroups[groupId] };
    setExpandedGroups(newExpandedState);
    try {
      await AsyncStorage.setItem(EXPANDED_STATE_KEY, JSON.stringify(newExpandedState));
    } catch (e) {}
  };

  const openCheckInModal = (goal) => {
    setActiveGoal(goal);
    setNote('');
    setImageUri(null);
    setModalVisible(true);
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("提示", "需要相册权限");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [4, 3], quality: 0.5, base64: true,
    });
    if (!result.canceled) setImageUri(`data:image/jpeg;base64,${result.assets[0].base64}`);
  };

  const handleSubmitCheckIn = async () => {
    if (!activeGoal) return;
    setSubmitting(true);
    try {
      // 【修复4】补卡逻辑：如果是补卡，需要传入 selectedDate 而不是当前时间
      // 我们保留当前时间的 时:分:秒，但将日期设置为 selectedDate
      const now = new Date();
      const checkInDate = new Date(selectedDate);
      checkInDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      // 注意：checkInGoal 需要支持传入 date 参数 (对应后端 api/checkins 的 date 字段)
      // 如果之前的 service 没有这个参数，它会默认取 Date.now()。
      // 这里我们假设你已经更新了 service 或者直接通过 API 调用。
      // 既然 RecordCheckInScreen 可以补卡，说明后端支持。
      await checkInGoal(activeGoal.id, note, imageUri, goals, checkInDate);
      
      await refreshData();
      setModalVisible(false);
      
      // 判断是打卡还是补卡，提示语文案
      const isPast = isBefore(startOfDay(selectedDate), startOfDay(new Date()));
      Alert.alert('提示', isPast ? '补卡成功' : '打卡成功');
    } catch (e) { Alert.alert('失败', e.message); } 
    finally { setSubmitting(false); }
  };

  // === 日期选择器处理 ===
  const openDatePicker = (target) => {
    setDatePickerTarget(target);
    setTempPickerDate(target === 'start' ? weekRange.start : weekRange.end);
    setShowDatePicker(true);
  };

  const handleDateChange = (event, date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) {
        if (Platform.OS === 'android') {
            applyDateChange(date);
        } else {
            setTempPickerDate(date);
        }
    }
  };

  const applyDateChange = (date) => {
    // 【修复3】日期切换逻辑
    if (datePickerTarget === 'start') {
        // 如果修改起始日期，selectedDate 设为该日期 (即该周的开始，虽然 startOfWeek 会自动处理)
        setSelectedDate(date);
    } else {
        // 如果修改结束日期，起始日期 = 结束日期 - 6天
        const newStart = subDays(date, 6);
        setSelectedDate(newStart);
    }
    setShowDatePicker(false);
  };

  const WeeklyCalendar = () => (
    <View style={styles.calendarContainer}>
      {/* 【修复2 & 3】头部行：日期范围 + 隐藏开关 */}
      <View style={styles.calendarHeaderRow}>
         {/* 左侧日期范围显示 (可点击) */}
         <View style={styles.dateRangeContainer}>
            <TouchableOpacity onPress={() => openDatePicker('start')}>
                <Text style={styles.dateRangeText}>
                    {format(weekRange.start, 'yyyy年M月d日', { locale: zhCN })}
                </Text>
            </TouchableOpacity>
            <Text style={styles.dateRangeText}> - </Text>
            <TouchableOpacity onPress={() => openDatePicker('end')}>
                <Text style={styles.dateRangeText}>
                    {format(weekRange.end, 'yyyy年M月d日', { locale: zhCN })}
                </Text>
            </TouchableOpacity>
         </View>

         <View style={styles.hideSwitchContainer}>
            <Text style={styles.hideSwitchLabel}>隐藏完成</Text>
            <Switch 
                value={hideCompleted} 
                onValueChange={toggleHideCompleted}
                trackColor={{ false: "#E5E5EA", true: "#34C759" }}
                thumbColor={"#fff"}
                style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }} 
            />
         </View>
      </View>

      <View style={styles.weekRow}>
        {weekDays.map((date, index) => {
          const isSelected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, new Date());
          return (
            <TouchableOpacity 
              key={index} 
              style={styles.dayItem} 
              onPress={() => setSelectedDate(date)}
              activeOpacity={0.7}
            >
              <Text style={[styles.dayLabel, isSelected && styles.activeDayLabelText, isToday && !isSelected && styles.todayText]}>
                {format(date, 'EEE', { locale: zhCN })}
              </Text>
              <View style={[styles.dayCircle, isSelected && styles.activeDayCircle]}>
                <Text style={[styles.dayNum, isSelected && styles.activeDayNum, isToday && !isSelected && styles.todayText]}>
                  {format(date, 'd')}
                </Text>
              </View>
              {isToday && !isSelected && <View style={styles.todayDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const GroupHeaderItem = ({ group, isExpanded, onToggle, count }) => (
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

  const TaskGridItem = ({ goal }) => {
    const { isCheckedToday, isFull, isCompleted, progressText, typeLabel } = getTaskStatus(goal);
    
    // 【修复4】补卡逻辑判断
    const today = startOfDay(new Date());
    const currentDay = startOfDay(selectedDate);
    const isToday = isSameDay(currentDay, today);
    const isPast = isBefore(currentDay, today);
    
    // 允许打卡的条件：今天是今天，或者今天是过去(补卡)，且未完成
    const canCheckIn = (isToday || isPast) && !isCheckedToday && !isFull;

    let TypeIcon = null;
    let typeColor = '#8E8E93';
    
    if (typeLabel === 'freq') {
        TypeIcon = "repeat";   
        typeColor = '#FF9500';
    } else if (typeLabel === 'flex') {
        TypeIcon = "infinite"; 
        typeColor = '#5856D6';
    } else {
        TypeIcon = "calendar"; 
        typeColor = '#007AFF';
    }

    return (
      <View style={[styles.gridCard, isCompleted && styles.completedCard]}>
        
        <View style={styles.typeBadge}>
            <Ionicons name={TypeIcon} size={16} color={typeColor} />
        </View>

        <View style={styles.cardContent}>
          <Text style={[styles.gridGoalName, isCompleted && styles.completedText]} numberOfLines={1}>
            {goal.name}
          </Text>
          <Text style={styles.gridGoalDesc} numberOfLines={1}>
            {progressText}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          {isCompleted ? (
             <View style={styles.statusBadgeCompleted}>
               <Ionicons name="checkmark" size={10} color="#fff" />
             </View>
          ) : (
             canCheckIn ? (
               <TouchableOpacity 
                  style={[styles.gridCheckInBtn, isPast && styles.retroCheckInBtn]} // 补卡样式
                  onPress={() => openCheckInModal(goal)}
                  activeOpacity={0.7}
               >
                 <Text style={styles.gridCheckInText}>
                    {isPast ? "补卡" : "打卡"} 
                 </Text>
               </TouchableOpacity>
             ) : (
               <View style={styles.futureBadge}>
                  <Text style={styles.futureText}>-</Text>
               </View>
             )
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <WeeklyCalendar />
      
      {groupedData.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            {isSameDay(selectedDate, new Date()) 
                ? (hideCompleted ? '任务已全部完成 🎉' : '今日暂无任务，享受生活吧 ☕️') 
                : '该日无安排'}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
          {groupedData.map((item) => {
            const isGroupExpanded = expandedGroups[item.group.id];
            
            return (
              <View key={item.group.id} style={styles.groupSection}>
                <GroupHeaderItem 
                  group={item.group} 
                  isExpanded={isGroupExpanded} 
                  onToggle={toggleGroupExpand} 
                  count={item.goals.length}
                />
                
                {isGroupExpanded && (
                  <View style={styles.gridContainer}>
                    {item.goals.map(goal => (
                      <TaskGridItem key={goal.id} goal={goal} />
                    ))}
                    {/* 占位符保持三列布局对齐 */}
                    {item.goals.length % 3 === 1 && <View style={[styles.gridCard, {opacity:0}]} />}
                    {item.goals.length % 3 === 1 && <View style={[styles.gridCard, {opacity:0}]} />}
                    {item.goals.length % 3 === 2 && <View style={[styles.gridCard, {opacity:0}]} />}
                  </View>
                )}
              </View>
            );
          })}
          <View style={{height: 60}} />
        </ScrollView>
      )}

      {/* 打卡/补卡 弹窗 */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{activeGoal?.name}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color="#8E8E93"/></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
              {imageUri ? <Image source={{ uri: imageUri }} style={styles.previewImage} /> : (
                <View style={{alignItems:'center'}}><Ionicons name="camera-outline" size={28} color="#C7C7CC"/><Text style={{color:'#C7C7CC', fontSize:12, marginTop:4}}>添加图片</Text></View>
              )}
            </TouchableOpacity>
            <TextInput style={styles.input} placeholder="写点备注..." placeholderTextColor="#C7C7CC" value={note} onChangeText={setNote} multiline />
            <TouchableOpacity 
                style={[styles.submitBtn, isBefore(startOfDay(selectedDate), startOfDay(new Date())) && {backgroundColor: '#FF9500'}]} 
                onPress={handleSubmitCheckIn} 
                disabled={submitting}
            >
              <Text style={styles.submitBtnText}>
                  {submitting ? '提交中...' : (isBefore(startOfDay(selectedDate), startOfDay(new Date())) ? '确认补卡' : '确认打卡')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 日期选择器 Modal (iOS/Android通用适配) */}
      {showDatePicker && (
        Platform.OS === 'ios' ? (
            <Modal transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, {alignItems:'center'}]}>
                        <Text style={styles.modalTitle}>选择日期</Text>
                        <DateTimePicker
                            value={tempPickerDate}
                            mode="date"
                            display="spinner"
                            onChange={handleDateChange}
                            locale="zh-CN"
                            style={{width: '100%', height: 150}}
                        />
                        <View style={{flexDirection:'row', marginTop: 20, width:'100%', justifyContent:'space-between'}}>
                            <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{padding:10}}>
                                <Text style={{fontSize:16, color:'#666'}}>取消</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => applyDateChange(tempPickerDate)} style={{padding:10}}>
                                <Text style={{fontSize:16, color:'#007AFF', fontWeight:'bold'}}>确定</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        ) : (
            <DateTimePicker
                value={tempPickerDate}
                mode="date"
                display="default"
                onChange={handleDateChange}
            />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  contentContainer: { paddingBottom: 40, paddingHorizontal: 16, paddingTop: 16 },
  
  // Calendar
  calendarContainer: {
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 10,
    marginBottom: 8,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  // 日期范围样式
  dateRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dateRangeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  hideSwitchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hideSwitchLabel: {
    fontSize: 10,
    color: '#8E8E93',
    marginRight: 0,
  },
  monthTitle: { fontSize: 16, fontWeight: '600', color: '#000', textAlign: 'center' },
  
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayItem: { alignItems: 'center', width: 40 },
  dayLabel: { fontSize: 12, color: '#8E8E93', marginBottom: 6 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  activeDayCircle: { backgroundColor: '#007AFF', shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  dayNum: { fontSize: 16, fontWeight: '600', color: '#333' },
  activeDayNum: { color: '#fff', fontWeight: 'bold' },
  activeDayLabelText: { color: '#007AFF', fontWeight: '600' },
  todayText: { color: '#007AFF' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#007AFF', marginTop: 4 },
  
  // Groups
  groupSection: { marginBottom: 20 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, marginBottom: 8 },
  groupTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginLeft: 6 },
  groupCount: { fontSize: 12, color: '#8E8E93', marginLeft: 8, backgroundColor: '#E5E5EA', paddingHorizontal: 6, borderRadius: 4, overflow:'hidden' },
  
  // Grid Layout (3 Columns)
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCard: {
    width: CARD_WIDTH,
    aspectRatio: 1, 
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: CARD_GAP,
    padding: 10,
    justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    position: 'relative'
  },
  completedCard: {
    backgroundColor: '#F9F9F9',
    opacity: 0.8,
  },
  typeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
  },
  cardContent: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  cardFooter: { height: 26, justifyContent: 'flex-end', alignItems: 'center', width: '100%' },
  
  gridGoalName: { fontSize: 14, fontWeight: '600', color: '#000', textAlign: 'center', marginBottom: 4 },
  gridGoalDesc: { fontSize: 10, color: '#8E8E93', textAlign: 'center' },
  completedText: { color: '#C7C7CC', textDecorationLine: 'line-through' },
  
  gridCheckInBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center'
  },
  retroCheckInBtn: {
    backgroundColor: '#FF9500', // 补卡用橙色
  },
  gridCheckInText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  
  statusBadgeCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  
  futureBadge: { backgroundColor: '#E5E5EA', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  futureText: { color: '#8E8E93', fontSize: 10 },

  emptyCard: { flex: 1, paddingTop: 60, alignItems: 'center' },
  emptyText: { color: '#8E8E93', fontSize: 15 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', width: '100%', maxWidth: 340, borderRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#000' },
  imagePicker: { height: 160, backgroundColor: '#F2F2F7', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderStyle:'dashed', borderWidth:1, borderColor:'#C7C7CC', overflow:'hidden' },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  input: { backgroundColor: '#F2F2F7', borderRadius: 12, padding: 16, height: 100, textAlignVertical: 'top', fontSize: 16, color: '#000', marginBottom: 24 },
  submitBtn: { backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});