import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useCheckIn } from '../context/CheckInContext';
import MonthCalendar from '../components/MonthCalendar';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { goals, checkIns, refreshData } = useCheckIn();
  const [displayMonth, setDisplayMonth] = useState(new Date());

  useFocusEffect(useCallback(() => {
    refreshData();
  }, []));

  const handleSelectDate = (date) => {
    navigation.navigate('DayDetail', { date: date.toISOString() });
  };

  const goToToday = () => {
    setDisplayMonth(new Date());
  };

  const todayIsCurrentMonth =
    new Date().getFullYear() === displayMonth.getFullYear() &&
    new Date().getMonth() === displayMonth.getMonth();

  return (
    <View style={styles.container}>
      {/* 导航栏 — 对齐 iOS 日历截图顶部 */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navBack} onPress={goToToday}>
          <Ionicons name="chevron-back" size={20} color="#007AFF" />
          <Text style={styles.navBackText}>
            {format(displayMonth, 'yyyy年')}
          </Text>
        </TouchableOpacity>
        <View style={styles.navRight}>
          {!todayIsCurrentMonth && (
            <TouchableOpacity onPress={goToToday} style={styles.navIcon}>
              <Text style={styles.todayBtn}>今天</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.navIcon} onPress={() => navigation.navigate('CreateGoal')}>
            <Ionicons name="add" size={26} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 月历 — flex:1 撑满整个剩余空间 */}
      <MonthCalendar
        displayMonth={displayMonth}
        onMonthChange={setDisplayMonth}
        onSelectDate={handleSelectDate}
        goals={goals || []}
        checkIns={checkIns || []}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  navBack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navBackText: {
    fontSize: 17,
    color: '#007AFF',
    marginLeft: 4,
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  navIcon: {
    padding: 4,
  },
  todayBtn: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '600',
  },
});
