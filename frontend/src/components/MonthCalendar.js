import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Platform } from 'react-native';
import { format, getDaysInMonth, getDay, isSameDay, addMonths, subMonths } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { getGoalsForDate, getTaskStatusForDate } from '../utils/goalUtils';

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const SCREEN_HEIGHT = Dimensions.get('window').height;
const NAV_HEIGHT = Platform.OS === 'ios' ? 56 + 8 : 40 + 8;
const TAB_BAR_HEIGHT = 84;
const MONTH_HEADER_HEIGHT = 52;
const WEEK_HEADER_HEIGHT = 28;
const CALENDAR_AREA = SCREEN_HEIGHT - NAV_HEIGHT - TAB_BAR_HEIGHT - MONTH_HEADER_HEIGHT - WEEK_HEADER_HEIGHT;

export default function MonthCalendar({
  displayMonth,
  onMonthChange,
  onSelectDate,
  goals,
  checkIns,
}) {
  const calendarDays = useMemo(() => {
    const year = displayMonth.getFullYear();
    const month = displayMonth.getMonth();
    const totalDays = getDaysInMonth(displayMonth);
    const startOffset = getDay(new Date(year, month, 1));

    const days = [];

    const prevMonthDate = new Date(year, month, 0);
    const prevMonthDays = prevMonthDate.getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
      });
    }

    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        days.push({
          date: new Date(year, month + 1, i),
          isCurrentMonth: false,
        });
      }
    }

    return days;
  }, [displayMonth]);

  const weeks = useMemo(() => {
    const w = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      w.push(calendarDays.slice(i, i + 7));
    }
    return w;
  }, [calendarDays]);

  const rowHeight = Math.floor(CALENDAR_AREA / weeks.length);

  const getDaySummary = (date) => {
    const dayGoals = getGoalsForDate(goals, date);
    if (dayGoals.length === 0) return [];

    const maxShow = dayGoals.length > 3 ? 2 : 3;
    const lines = [];

    for (let i = 0; i < Math.min(maxShow, dayGoals.length); i++) {
      const goal = dayGoals[i];
      const status = getTaskStatusForDate(goal, date, checkIns);
      lines.push({ text: goal.name, done: status.isCompleted });
    }

    if (dayGoals.length > 3) {
      lines.push({ text: `+${dayGoals.length - 2}项...`, isOverflow: true });
    }

    return lines;
  };

  return (
    <View style={styles.container}>
      {/* 月份标题 — 左对齐，像截图中的 "六月" */}
      <View style={styles.monthHeader}>
        <Text style={styles.monthTitle}>
          {format(displayMonth, 'M月')}
        </Text>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => onMonthChange(subMonths(displayMonth, 1))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onMonthChange(addMonths(displayMonth, 1))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-forward" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 周表头 */}
      <View style={styles.weekHeader}>
        {WEEK_LABELS.map(d => (
          <Text key={d} style={styles.weekLabel}>{d}</Text>
        ))}
      </View>

      {/* 日期格子 — 用 flex:1 撑满剩余空间 */}
      <View style={styles.gridArea}>
        {weeks.map((week, wi) => (
          <View key={wi} style={[styles.weekRow, { height: rowHeight }]}>
            {week.map(({ date, isCurrentMonth }) => {
              const isToday = isSameDay(date, new Date());
              const summary = isCurrentMonth ? getDaySummary(date) : [];

              return (
                <TouchableOpacity
                  key={date.toISOString()}
                  style={styles.dayCell}
                  onPress={() => onSelectDate(date)}
                  activeOpacity={0.5}
                >
                  {/* 日期数字 — 左上角对齐（像 iOS 日历截图） */}
                  <View style={styles.dayTop}>
                    <View style={[
                      styles.dayNumberWrap,
                      isToday && styles.todayCircle,
                    ]}>
                      <Text style={[
                        styles.dayNumber,
                        !isCurrentMonth && styles.dayNumberOutside,
                        isToday && styles.dayNumberWhite,
                      ]}>
                        {date.getDate()}
                      </Text>
                    </View>
                  </View>

                  {/* 任务摘要 */}
                  <View style={styles.taskList}>
                    {summary.map((line, li) => (
                      <View key={li} style={styles.taskLine}>
                        {!line.isOverflow && (
                          <View style={[
                            styles.statusDot,
                            { backgroundColor: line.done ? '#34C759' : '#FF9500' },
                          ]} />
                        )}
                        <Text
                          style={[
                            styles.taskLineText,
                            line.done && styles.taskLineTextDone,
                            line.isOverflow && styles.taskLineTextOverflow,
                          ]}
                          numberOfLines={1}
                        >
                          {line.isOverflow ? line.text : line.text}
                        </Text>
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* 行底部分割线 */}
            <View style={styles.rowSeparator} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // 月份标题 — 左对齐大字，像截图中的 "六月"
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: MONTH_HEADER_HEIGHT,
  },
  monthTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.37,
  },
  monthNav: {
    flexDirection: 'row',
    gap: 24,
  },

  // 周表头
  weekHeader: {
    flexDirection: 'row',
    height: WEEK_HEADER_HEIGHT,
    alignItems: 'center',
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
  },

  // 格子区域撑满
  gridArea: {
    flex: 1,
  },

  // 周行
  weekRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(60,60,67,0.18)',
    position: 'relative',
  },

  // 单日格子
  dayCell: {
    flex: 1,
    paddingTop: 4,
    paddingHorizontal: 2,
  },

  // 日期数字区域
  dayTop: {
    alignItems: 'center',
    marginBottom: 3,
  },
  dayNumberWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  todayCircle: {
    backgroundColor: '#000000',
  },
  dayNumber: {
    fontSize: 17,
    fontWeight: '400',
    color: '#000',
  },
  dayNumberOutside: {
    color: '#D1D1D6',
  },
  dayNumberWhite: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  taskList: {
    gap: 1,
    paddingHorizontal: 1,
  },
  taskLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 2,
    flexShrink: 0,
  },
  taskLineText: {
    fontSize: 9,
    lineHeight: 12,
    color: '#333',
    fontWeight: '400',
    flex: 1,
  },
  taskLineTextDone: {
    color: '#AEAEB2',
    textDecorationLine: 'line-through',
  },
  taskLineTextOverflow: {
    color: '#007AFF',
    fontWeight: '600',
    textDecorationLine: 'none',
  },
});
