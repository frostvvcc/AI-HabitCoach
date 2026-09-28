import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Modal, TextInput, Image, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { format, isSameDay, isBefore, startOfDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useCheckIn } from '../context/CheckInContext';
import { checkInGoal, getGroups } from '../services/checkInService';
import {
  getGoalsForDate, getTaskStatusForDate,
  getSummaryText, getCheckInTimeForGoal,
} from '../utils/goalUtils';

const GROUP_COLORS = [
  { text: '#007AFF', sep: '#C8E1FF' },
  { text: '#34C759', sep: '#B8E6B8' },
  { text: '#FF9500', sep: '#FFD9A0' },
  { text: '#AF52DE', sep: '#D9B8FF' },
  { text: '#FF3B30', sep: '#FFBAB4' },
  { text: '#5AC8FA', sep: '#B2EBF2' },
];

export default function DayDetailScreen({ route }) {
  const navigation = useNavigation();
  const { goals, checkIns, refreshData } = useCheckIn();

  const targetDate = new Date(route.params.date);
  const isPast = isBefore(startOfDay(targetDate), startOfDay(new Date()));
  const isToday = isSameDay(targetDate, new Date());

  const [modalVisible, setModalVisible] = useState(false);
  const [activeGoal, setActiveGoal] = useState(null);
  const [note, setNote] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [groups, setGroups] = useState([]);

  useFocusEffect(useCallback(() => {
    refreshData();
    loadGroups();
  }, []));

  const loadGroups = async () => {
    try {
      const apiGroups = await getGroups();
      setGroups([{ id: 'default', name: '默认分组', isVirtual: true }, ...apiGroups]);
    } catch (e) {}
  };

  const dayGoals = useMemo(() => getGoalsForDate(goals, targetDate), [goals, targetDate]);

  const groupedData = useMemo(() => {
    const result = [];
    groups.forEach((group, gi) => {
      let gGoals;
      if (group.id === 'default') {
        gGoals = dayGoals.filter(g => !g.group_id);
      } else {
        gGoals = dayGoals.filter(g => String(g.group_id) === String(group.id));
      }
      if (hideCompleted) {
        gGoals = gGoals.filter(g => !getTaskStatusForDate(g, targetDate, checkIns).isCompleted);
      }
      if (gGoals.length > 0) {
        result.push({ group, goals: gGoals, colorIndex: gi });
      }
    });
    return result;
  }, [dayGoals, groups, checkIns, hideCompleted, targetDate]);

  const totalCount = dayGoals.length;
  const doneCount = dayGoals.filter(g => getTaskStatusForDate(g, targetDate, checkIns).isCompleted).length;

  const openCheckInModal = (goal) => {
    setActiveGoal(goal);
    setNote('');
    setImageUri(null);
    setModalVisible(true);
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('提示', '需要相册权限');
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
      const now = new Date();
      const checkInDate = new Date(targetDate);
      checkInDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
      await checkInGoal(activeGoal.id, note, imageUri, goals, checkInDate);
      await refreshData();
      setModalVisible(false);
      Alert.alert('提示', isPast ? '补卡成功' : '打卡成功');
    } catch (e) {
      Alert.alert('失败', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* 顶部导航 */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>
        <View style={styles.topRight}>
          <TouchableOpacity onPress={() => setHideCompleted(!hideCompleted)} style={styles.topIcon}>
            <Ionicons name={hideCompleted ? 'eye' : 'eye-off-outline'} size={20} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topIcon}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 日期大标题 */}
      <View style={styles.titleSection}>
        <Text style={styles.dateTitle}>{format(targetDate, 'M月d日')}</Text>
        <Text style={styles.dateSub}>
          {format(targetDate, 'EEEE', { locale: zhCN })} · 共{totalCount}项 · 已完成{doneCount}项
        </Text>
      </View>

      {/* 任务列表 */}
      <ScrollView style={styles.listArea} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {groupedData.map(({ group, goals: gGoals, colorIndex }) => {
          const gc = GROUP_COLORS[colorIndex % GROUP_COLORS.length];
          return (
            <View key={group.id}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionLine, { backgroundColor: gc.sep }]} />
                <Text style={[styles.sectionTitle, { color: gc.text }]}>{group.name}</Text>
                <View style={[styles.sectionLine, { backgroundColor: gc.sep, flex: 1 }]} />
              </View>

              {gGoals.map((goal, i) => {
                const status = getTaskStatusForDate(goal, targetDate, checkIns);
                const canCheckIn = !status.isCompleted && (isToday || isPast);
                const ciTime = getCheckInTimeForGoal(goal, targetDate, checkIns);

                return (
                  <View key={goal.id}>
                    <TouchableOpacity
                      style={styles.taskRow}
                      onPress={() => canCheckIn && openCheckInModal(goal)}
                      activeOpacity={canCheckIn ? 0.6 : 1}
                    >
                      <View style={[styles.checkbox, status.isCompleted && styles.checkboxDone]}>
                        {status.isCompleted && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>

                      <View style={styles.taskBody}>
                        <Text style={[styles.taskName, status.isCompleted && styles.taskNameDone]}>
                          {goal.name}
                        </Text>
                        <Text style={styles.taskMeta}>
                          {getSummaryText(goal)} · {status.progressText}
                        </Text>
                        {status.isCompleted && ciTime ? (
                          <Text style={styles.taskTime}>✓ 完成于 {ciTime}</Text>
                        ) : goal.reminder_time ? (
                          <Text style={styles.taskReminder}>提醒 {goal.reminder_time}</Text>
                        ) : null}
                      </View>

                      {canCheckIn && (
                        <TouchableOpacity
                          style={[styles.checkInBtn, isPast && styles.checkInBtnRetro]}
                          onPress={() => openCheckInModal(goal)}
                        >
                          <Text style={styles.checkInBtnText}>{isPast ? '补卡' : '打卡'}</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>

                    {i < gGoals.length - 1 && <View style={styles.taskSeparator} />}
                  </View>
                );
              })}
            </View>
          );
        })}

        {groupedData.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color="#C7C7CC" />
            <Text style={styles.emptyText}>
              {hideCompleted ? '所有任务已完成' : '该日暂无任务'}
            </Text>
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 右下角 FAB */}
      {(isToday || isPast) && (
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CreateGoal')}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* 打卡弹窗 */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{activeGoal?.name}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Ionicons name="camera-outline" size={28} color="#C7C7CC" />
                  <Text style={{ color: '#C7C7CC', fontSize: 12, marginTop: 4 }}>添加图片</Text>
                </View>
              )}
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="写点备注..."
              placeholderTextColor="#C7C7CC"
              value={note}
              onChangeText={setNote}
              multiline
            />
            <TouchableOpacity
              style={[styles.submitBtn, isPast && { backgroundColor: '#FF9500' }]}
              onPress={handleSubmitCheckIn}
              disabled={submitting}
            >
              <Text style={styles.submitBtnText}>
                {submitting ? '提交中...' : (isPast ? '确认补卡' : '确认打卡')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center', alignItems: 'center',
  },
  topRight: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    borderRadius: 22,
    paddingHorizontal: 4, paddingVertical: 4,
  },
  topIcon: {
    width: 40, height: 36,
    justifyContent: 'center', alignItems: 'center',
  },

  titleSection: {
    paddingHorizontal: 20,
    paddingTop: 4, paddingBottom: 16,
  },
  dateTitle: {
    fontSize: 34, fontWeight: '700',
    color: '#007AFF', letterSpacing: 0.37,
  },
  dateSub: {
    fontSize: 13, color: '#8E8E93', marginTop: 4,
  },

  listArea: { flex: 1 },
  listContent: { paddingHorizontal: 20 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 20, marginBottom: 12,
  },
  sectionLine: { height: 1, width: 16, marginRight: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginRight: 8 },

  taskRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 10,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#C7C7CC',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 14, marginTop: 2,
  },
  checkboxDone: {
    backgroundColor: '#34C759', borderColor: '#34C759',
  },
  taskBody: { flex: 1 },
  taskName: {
    fontSize: 17, fontWeight: '600', color: '#000', marginBottom: 2,
  },
  taskNameDone: { color: '#C7C7CC', fontWeight: '400' },
  taskMeta: { fontSize: 13, color: '#8E8E93', marginBottom: 1 },
  taskTime: { fontSize: 13, color: '#34C759' },
  taskReminder: { fontSize: 13, color: '#FF9500' },
  taskSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60,60,67,0.12)',
    marginLeft: 38,
  },

  checkInBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 14, marginTop: 2,
  },
  checkInBtnRetro: { backgroundColor: '#FF9500' },
  checkInBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: '#C7C7CC', marginTop: 12 },

  fab: {
    position: 'absolute', right: 24, bottom: 36,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff', width: '100%', maxWidth: 340,
    borderRadius: 24, padding: 24,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#000' },
  imagePicker: {
    height: 160, backgroundColor: '#F2F2F7', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    borderStyle: 'dashed', borderWidth: 1, borderColor: '#C7C7CC', overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  input: {
    backgroundColor: '#F2F2F7', borderRadius: 12, padding: 16,
    height: 100, textAlignVertical: 'top', fontSize: 16, color: '#000', marginBottom: 24,
  },
  submitBtn: {
    backgroundColor: '#007AFF', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
