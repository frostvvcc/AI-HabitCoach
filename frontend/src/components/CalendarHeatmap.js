import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { format, eachDayOfInterval, isSameDay, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, getDaysInMonth, setYear, setMonth } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';

export default function CalendarHeatmap({ 
  checkInsByDate, 
  onDateSelect,
  selectedDate 
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  
  const today = new Date();
  const currentYear = currentMonth.getFullYear();
  const currentMonthNum = currentMonth.getMonth() + 1;
  
  // 生成年份列表（从2020年到今年）
  const years = Array.from({ length: today.getFullYear() - 2019 }, (_, i) => 2020 + i);
  
  // 月份列表
  const months = [
    { value: 1, label: '1月' },
    { value: 2, label: '2月' },
    { value: 3, label: '3月' },
    { value: 4, label: '4月' },
    { value: 5, label: '5月' },
    { value: 6, label: '6月' },
    { value: 7, label: '7月' },
    { value: 8, label: '8月' },
    { value: 9, label: '9月' },
    { value: 10, label: '10月' },
    { value: 11, label: '11月' },
    { value: 12, label: '12月' },
  ];
  
  // 选择年份
  const handleYearSelect = (year) => {
    const newDate = setYear(currentMonth, year);
    // 如果选择的年份是今年，月份不能超过当前月份
    if (year === today.getFullYear() && newDate > today) {
      setCurrentMonth(today);
    } else {
      setCurrentMonth(newDate);
    }
    setShowYearPicker(false);
  };
  
  // 选择月份
  const handleMonthSelect = (month) => {
    const newDate = setMonth(currentMonth, month - 1);
    // 如果选择的月份超过今天，则设置为今天
    if (newDate > today) {
      setCurrentMonth(today);
    } else {
      setCurrentMonth(newDate);
    }
    setShowMonthPicker(false);
  };

  // 获取月份的第一天和最后一天
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  
  // 获取日历显示的第一天（包含上个月的几天）和最后一天（包含下个月的几天）
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // 周一开始
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  // 生成日历中的所有日期
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  // 计算每个日期的打卡强度（0-4级）
  const getIntensity = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const count = checkInsByDate[dateStr] || 0;
    if (count === 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count >= 3) return 3;
    return 0;
  };

  // 获取颜色
  const getColor = (intensity) => {
    const colors = ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127'];
    return colors[intensity];
  };

  // 按周分组
  const weeks = [];
  let currentWeek = [];
  
  days.forEach((day, index) => {
    if (index % 7 === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(day);
  });
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  // 切换月份
  const handlePrevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    const nextMonth = addMonths(currentMonth, 1);
    // 不能超过当前月份
    if (nextMonth <= today) {
      setCurrentMonth(nextMonth);
    }
  };

  // 处理日期点击
  const handleDatePress = (date) => {
    if (onDateSelect) {
      onDateSelect(date);
    }
  };

  // 判断日期是否在当前月份
  const isCurrentMonth = (date) => {
    return date.getMonth() === currentMonth.getMonth() && 
           date.getFullYear() === currentMonth.getFullYear();
  };

  const canGoNext = addMonths(currentMonth, 1) <= today;

  return (
    <View style={styles.container}>
      {/* 月份选择器 */}
      <View style={styles.monthHeader}>
        <TouchableOpacity 
          style={styles.monthButton}
          onPress={handlePrevMonth}
        >
          <Ionicons name="chevron-back" size={24} color="#4A90E2" />
        </TouchableOpacity>
        
        <View style={styles.monthTitleContainer}>
          <TouchableOpacity onPress={() => setShowYearPicker(true)}>
            <Text style={styles.monthTitle}>{currentYear}年</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowMonthPicker(true)}>
            <Text style={styles.monthTitle}>{currentMonthNum}月</Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity 
          style={[styles.monthButton, !canGoNext && styles.monthButtonDisabled]}
          onPress={handleNextMonth}
          disabled={!canGoNext}
        >
          <Ionicons 
            name="chevron-forward" 
            size={24} 
            color={canGoNext ? "#4A90E2" : "#ccc"} 
          />
        </TouchableOpacity>
      </View>
      
      {/* 年份选择器 */}
      <Modal
        visible={showYearPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowYearPicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowYearPicker(false)}
        >
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>选择年份</Text>
              <TouchableOpacity onPress={() => setShowYearPicker(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerContent}>
              {years.map((year) => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.pickerItem,
                    year === currentYear && styles.pickerItemActive,
                  ]}
                  onPress={() => handleYearSelect(year)}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      year === currentYear && styles.pickerItemTextActive,
                    ]}
                  >
                    {year}年
                  </Text>
                  {year === currentYear && (
                    <Ionicons name="checkmark" size={20} color="#4A90E2" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
      
      {/* 月份选择器 */}
      <Modal
        visible={showMonthPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMonthPicker(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMonthPicker(false)}
        >
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>选择月份</Text>
              <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerContent}>
              {months.map((month) => {
                const isDisabled = currentYear === today.getFullYear() && 
                                  month.value > today.getMonth() + 1;
                return (
                  <TouchableOpacity
                    key={month.value}
                    style={[
                      styles.pickerItem,
                      month.value === currentMonthNum && styles.pickerItemActive,
                      isDisabled && styles.pickerItemDisabled,
                    ]}
                    onPress={() => !isDisabled && handleMonthSelect(month.value)}
                    disabled={isDisabled}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        month.value === currentMonthNum && styles.pickerItemTextActive,
                        isDisabled && styles.pickerItemTextDisabled,
                      ]}
                    >
                      {month.label}
                    </Text>
                    {month.value === currentMonthNum && (
                      <Ionicons name="checkmark" size={20} color="#4A90E2" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 星期标签 */}
      <View style={styles.weekLabels}>
        {['一', '二', '三', '四', '五', '六', '日'].map((label, index) => (
          <View key={index} style={styles.weekLabel}>
            <Text style={styles.weekLabelText}>{label}</Text>
          </View>
        ))}
      </View>

      {/* 日历网格 */}
      <View style={styles.calendar}>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.week}>
            {week.map((day, dayIndex) => {
              const intensity = getIntensity(day);
              const isToday = isSameDay(day, today);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isInCurrentMonth = isCurrentMonth(day);
              
              return (
                <TouchableOpacity
                  key={dayIndex}
                  style={[
                    styles.day,
                    { backgroundColor: getColor(intensity) },
                    !isInCurrentMonth && styles.dayOtherMonth,
                    isToday && styles.today,
                    isSelected && styles.selected,
                  ]}
                  onPress={() => handleDatePress(day)}
                >
                  <Text style={[
                    styles.dayText,
                    !isInCurrentMonth && styles.dayTextOtherMonth,
                    isSelected && styles.dayTextSelected,
                  ]}>
                    {format(day, 'd')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* 图例 */}
      <View style={styles.legend}>
        <Text style={styles.legendText}>少</Text>
        <View style={styles.legendColors}>
          {[0, 1, 2, 3].map((level) => (
            <View
              key={level}
              style={[
                styles.legendSquare,
                { backgroundColor: getColor(level) },
              ]}
            />
          ))}
        </View>
        <Text style={styles.legendText}>多</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  monthButton: {
    padding: 8,
  },
  monthButtonDisabled: {
    opacity: 0.3,
  },
  monthTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#4A90E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '80%',
    maxHeight: '60%',
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  pickerContent: {
    maxHeight: 400,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pickerItemActive: {
    backgroundColor: '#f0f7ff',
  },
  pickerItemDisabled: {
    opacity: 0.3,
  },
  pickerItemText: {
    fontSize: 16,
    color: '#333',
  },
  pickerItemTextActive: {
    color: '#4A90E2',
    fontWeight: '600',
  },
  pickerItemTextDisabled: {
    color: '#999',
  },
  weekLabels: {
    flexDirection: 'row',
    marginBottom: 10,
    paddingHorizontal: 5,
  },
  weekLabel: {
    flex: 1,
    alignItems: 'center',
  },
  weekLabelText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  calendar: {
    flexDirection: 'column',
    marginBottom: 15,
  },
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  day: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 6,
    marginHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    maxHeight: 50,
  },
  dayOtherMonth: {
    opacity: 0.3,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  dayTextOtherMonth: {
    color: '#999',
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  today: {
    borderWidth: 2,
    borderColor: '#4A90E2',
  },
  selected: {
    backgroundColor: '#4A90E2',
    borderWidth: 2,
    borderColor: '#4A90E2',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  legendText: {
    fontSize: 12,
    color: '#666',
    marginHorizontal: 8,
  },
  legendColors: {
    flexDirection: 'row',
    gap: 4,
  },
  legendSquare: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
});
