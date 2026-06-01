import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Switch,
  SafeAreaView,
  Image,
  Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useCheckIn } from '../context/CheckInContext';

const AVATAR_OPTIONS = [
  { name: 'person-circle', color: '#007AFF' },
  { name: 'person-circle', color: '#FF3B30' },
  { name: 'person-circle', color: '#34C759' },
  { name: 'person-circle', color: '#FF9500' },
  { name: 'person-circle', color: '#AF52DE' },
  { name: 'person-circle', color: '#5856D6' },
];

export default function MyScreen() {
  // 1. 获取 changePassword 方法
  const { user, logout, updateUser, changePassword } = useAuth();
  const { checkIns = [], goals = [] } = useCheckIn();

  // --- 状态管理 ---
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [nickname, setNickname] = useState(user?.nickname || '');

  // 新功能状态
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
    
  // --- 🌟 助力开发者相关状态 🌟 ---
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportAmount, setSupportAmount] = useState('');
  const [supportStep, setSupportStep] = useState(1); // 1: 输入金额, 2: 展示二维码

  // 通知设置状态
  const [notifySettings, setNotifySettings] = useState({
    allow: true,
    sound: true,
    vibrate: true,
  });

  // 修改密码状态
  const [passwordForm, setPasswordForm] = useState({
    old: '',
    new: '',
    confirm: ''
  });

  // --- 逻辑处理 ---

  const handleLogout = () => {
    Alert.alert('确认退出', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: async () => { await logout(); } },
    ]);
  };

  const handleUpdateNickname = async () => {
    if (!nickname.trim()) return Alert.alert('提示', '昵称不能为空');
    try {
      await updateUser({ nickname: nickname.trim() });
      setShowNicknameModal(false);
    } catch (e) { Alert.alert('失败', '修改失败'); }
  };

  const handleSelectAvatar = async (avatar) => {
    try {
      await updateUser({ avatar });
      setShowAvatarModal(false);
    } catch (e) { Alert.alert('失败', '修改失败'); }
  };

  // 2. 修改密码核心逻辑
  const handleChangePassword = async () => {
    const { old, new: newPwd, confirm } = passwordForm;
    
    if (!old || !newPwd || !confirm) return Alert.alert('提示', '请填写完整信息');
    if (newPwd.length < 6) return Alert.alert('提示', '新密码长度至少需要6位');
    if (newPwd !== confirm) return Alert.alert('错误', '两次新密码输入不一致');

    try {
      await changePassword(old, newPwd);
      Alert.alert('成功', '密码修改成功，请重新登录', [
        { 
          text: '好的', 
          onPress: () => {
            setShowPasswordModal(false);
            setPasswordForm({ old: '', new: '', confirm: '' });
            logout(); 
          }
        }
      ]);
    } catch (error) {
      Alert.alert('修改失败', error.message || '请检查网络或旧密码是否正确');
    }
  };

  // --- 🌟 助力开发者逻辑 🌟 ---
  const handleOpenSupport = () => {
    setSupportAmount('');
    setSupportStep(1);
    setShowSupportModal(true);
  };

  const handleGenerateQR = () => {

    Keyboard.dismiss();
    setSupportStep(2); // 进入二维码展示步骤
  };

  const handleConfirmSupport = () => {
    setShowSupportModal(false);
    // 延迟一点显示 Alert，体验更好
    setTimeout(() => {
      Alert.alert(
        '❤️ 感谢您的支持',
        '不管您是否实际支付，您的心意我都收到了！\n\n您的每一次鼓励都是我完善 App 的动力。祝您生活愉快，目标达成！',
        [{ text: '不客气' }]
      );
    }, 300);
  };

  // 关于我们/帮助逻辑
  const handleHelp = () => {
    Alert.alert('帮助与反馈', '如遇到问题，请联系客服邮箱：\n418015903@qq.com');
  };
  const handleAbout = () => {
    Alert.alert('关于我们', 'Check-In App v1.0.0\n\n致力于帮助用户养成良好习惯。\n© 2026 All Rights Reserved');
  };

  // 头像处理
  let currentAvatar = { name: 'person-circle', color: '#007AFF' };
  if (user?.avatar) {
    try {
      const parsed = typeof user.avatar === 'string' ? JSON.parse(user.avatar) : user.avatar;
      if (parsed?.color) currentAvatar = parsed;
    } catch (e) {}
  }
    
  const displayName = user?.nickname || '用户';

  // --- 组件 ---

  const MenuItem = ({ icon, label, onPress, isDestructive, hasArrow = true, iconColor }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuLeft}>
        <Ionicons name={icon} size={22} color={iconColor || (isDestructive ? "#FF3B30" : "#333")} />
        <Text style={[styles.menuText, isDestructive && styles.destructiveText]}>{label}</Text>
      </View>
      {hasArrow && <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        
      {/* 头部个人信息 */}
      <View style={styles.profileHeader}>
        <TouchableOpacity onPress={() => setShowAvatarModal(true)}>
          <Ionicons name={currentAvatar.name} size={84} color={currentAvatar.color} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.nameBox} onPress={() => { setNickname(user?.nickname||''); setShowNicknameModal(true); }}>
          <Text style={styles.userName}>{displayName}</Text>
          <Ionicons name="create-outline" size={16} color="#8E8E93" />
        </TouchableOpacity>
        <Text style={styles.userPhone}>{user?.phone ? ` ${user.phone}` : '未绑定手机'}</Text>
      </View>

      {/* 数据概览 */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{checkIns.length}</Text>
          <Text style={styles.statLabel}>总打卡</Text>
        </View>
        <View style={{width: 1, height: 30, backgroundColor: '#E5E5EA'}} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{goals.length}</Text>
          <Text style={styles.statLabel}>在办目标</Text>
        </View>
      </View>

      {/* 菜单列表 */}
      <View style={styles.menuGroup}>
        <MenuItem icon="notifications-outline" label="消息通知" onPress={() => setShowNotifyModal(true)} />
        <View style={styles.divider} />
        <MenuItem icon="shield-checkmark-outline" label="修改密码" onPress={() => setShowPasswordModal(true)} />
      </View>

      {/* 🌟 新增助力开发者入口 🌟 */}
      <View style={styles.menuGroup}>
        <MenuItem 
            icon="cafe-outline" 
            label="助力开发者" 
            iconColor="#FF9500" // 用个醒目的颜色
            onPress={handleOpenSupport} 
        />
      </View>

      <View style={styles.menuGroup}>
        <MenuItem icon="help-circle-outline" label="帮助与反馈" onPress={handleHelp} />
        <View style={styles.divider} />
        <MenuItem icon="information-circle-outline" label="关于我们" onPress={handleAbout} />
      </View>

      <View style={styles.menuGroup}>
        <MenuItem icon="log-out-outline" label="退出登录" isDestructive onPress={handleLogout} />
      </View>

      {/* ================= MODALS ================= */}

      {/* 1. 修改昵称 Modal */}
      <Modal visible={showNicknameModal} transparent animationType="fade" onRequestClose={() => setShowNicknameModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>修改昵称</Text>
            <TextInput style={styles.input} value={nickname} onChangeText={setNickname} maxLength={20} autoFocus placeholder="请输入新昵称"/>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setShowNicknameModal(false)}><Text style={styles.cancelText}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.confirmBtn]} onPress={handleUpdateNickname}><Text style={styles.confirmText}>保存</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. 头像选择 Modal */}
      <Modal visible={showAvatarModal} transparent animationType="fade" onRequestClose={() => setShowAvatarModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>选择头像色系</Text>
            <View style={styles.avatarGrid}>
              {AVATAR_OPTIONS.map((av, i) => (
                <TouchableOpacity key={i} onPress={() => handleSelectAvatar(av)} style={styles.avatarOption}>
                  <Ionicons name={av.name} size={48} color={av.color} />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowAvatarModal(false)}><Text style={styles.closeText}>取消</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3. 消息通知 Modal */}
      <Modal visible={showNotifyModal} animationType="slide" onRequestClose={() => setShowNotifyModal(false)}>
        <SafeAreaView style={{flex: 1, backgroundColor: '#F2F2F7'}}>
          <View style={styles.pageHeader}>
            <TouchableOpacity onPress={() => setShowNotifyModal(false)} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color="#007AFF" />
              <Text style={styles.headerActionText}>返回</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>消息通知</Text>
            <View style={{width: 60}} /> 
          </View>
            
          <ScrollView>
            <View style={styles.settingsGroup}>
              {/* 总开关 */}
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>允许通知</Text>
                <Switch 
                  value={notifySettings.allow} 
                  onValueChange={(val) => setNotifySettings(prev => ({...prev, allow: val}))}
                />
              </View>
                
              <View style={styles.divider} />
                
              {/* 声音 */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, !notifySettings.allow && styles.disabledText]}>声音</Text>
                <Switch 
                  value={notifySettings.sound} 
                  disabled={!notifySettings.allow}
                  onValueChange={(val) => setNotifySettings(prev => ({...prev, sound: val}))}
                />
              </View>

              <View style={styles.divider} />
                
              {/* 振动 */}
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, !notifySettings.allow && styles.disabledText]}>振动</Text>
                <Switch 
                  value={notifySettings.vibrate} 
                  disabled={!notifySettings.allow}
                  onValueChange={(val) => setNotifySettings(prev => ({...prev, vibrate: val}))}
                />
              </View>
            </View>
            <Text style={styles.tipsText}>关闭通知后，您将无法收到打卡提醒。</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 4. 修改密码 Modal */}
      <Modal visible={showPasswordModal} animationType="slide" onRequestClose={() => setShowPasswordModal(false)}>
        <SafeAreaView style={{flex: 1, backgroundColor: '#F2F2F7'}}>
          <View style={styles.pageHeader}>
            <TouchableOpacity onPress={() => setShowPasswordModal(false)} style={styles.backBtn}>
              <Text style={styles.headerActionText}>取消</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>修改密码</Text>
            <TouchableOpacity onPress={handleChangePassword} style={styles.backBtn}>
              <Text style={[styles.headerActionText, {fontWeight: 'bold'}]}>完成</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{paddingTop: 20}}>
            <View style={styles.inputGroup}>
              <TextInput 
                style={styles.settingInput} 
                placeholder="旧密码" 
                secureTextEntry 
                value={passwordForm.old}
                onChangeText={(t) => setPasswordForm(p => ({...p, old: t}))}
              />
              <View style={styles.divider} />
              <TextInput 
                style={styles.settingInput} 
                placeholder="新密码" 
                secureTextEntry 
                value={passwordForm.new}
                onChangeText={(t) => setPasswordForm(p => ({...p, new: t}))}
              />
              <View style={styles.divider} />
              <TextInput 
                style={styles.settingInput} 
                placeholder="确认新密码" 
                secureTextEntry 
                value={passwordForm.confirm}
                onChangeText={(t) => setPasswordForm(p => ({...p, confirm: t}))}
              />
            </View>
            <Text style={styles.tipsText}>密码长度建议不少于6位，包含字母和数字。</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 🌟 5. 助力开发者 Modal 🌟 */}
      <Modal visible={showSupportModal} transparent animationType="fade" onRequestClose={() => setShowSupportModal(false)}>
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>
                    {supportStep === 1 ? '☕️ 请开发者喝咖啡' : '感谢您的支持'}
                </Text>

                {supportStep === 1 ? (
                    

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setShowSupportModal(false)}>
                                <Text style={styles.cancelText}>取消</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.confirmBtn]} onPress={handleGenerateQR}>
                                <Text style={styles.confirmText}>我要助力</Text>
                            </TouchableOpacity>
                        </View>
                  
                ) : (
                    // 步骤2: 展示二维码
                    <>
                         <View style={styles.qrContainer}>
                            {/* ✅ 修改处：图片加载本地资源 */}
                            <Image 
                              source={require('../../assets/pay.jpg')} 
                              style={styles.qrImage} 
                              resizeMode="contain" 
                            />


                         </View>

                         <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setSupportStep(1)}>
                                <Text style={styles.cancelText}>上一步</Text>
                            </TouchableOpacity>
                            {/* 这里的文案改成了“我已助力”，点击直接感谢 */}
                            <TouchableOpacity style={[styles.modalBtn, styles.confirmBtn, {backgroundColor: '#34C759'}]} onPress={handleConfirmSupport}>
                                <Text style={styles.confirmText}>我已助力</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  contentContainer: { paddingTop: 60, paddingBottom: 40 },
   
  // 个人信息
  profileHeader: { alignItems: 'center', marginBottom: 24 },
  nameBox: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 4 },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#000', marginRight: 6 },
  userPhone: { fontSize: 13, color: '#8E8E93' },
   
  // 数据统计
  statsRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 20, marginHorizontal: 16, borderRadius: 12, marginBottom: 24 },
  statItem: { alignItems: 'center', minWidth: 80 },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#000', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#8E8E93' },
   
  // 菜单组
  menuGroup: { backgroundColor: '#fff', borderRadius: 12, marginHorizontal: 16, marginBottom: 20, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuText: { fontSize: 16, color: '#000' },
  destructiveText: { color: '#FF3B30' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5EA', marginLeft: 16 },

  // 通用 Modal 样式
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  // ✅ 修改：增加了 width 和 padding，让弹窗更大
  modalContent: { backgroundColor: '#fff', width: '90%', borderRadius: 16, padding: 30, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 20, color: '#000' },
  input: { width: '100%', backgroundColor: '#F2F2F7', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#F2F2F7' },
  confirmBtn: { backgroundColor: '#007AFF' },
  cancelText: { color: '#000', fontSize: 16, fontWeight: '500' },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginBottom: 20 },
  closeBtn: { marginTop: 10 },
  closeText: { fontSize: 16, color: '#007AFF' },

  // 新页面的样式 (Header & Settings)
  pageHeader: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C7C7CC' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  headerActionText: { fontSize: 17, color: '#007AFF' },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
   
  settingsGroup: { marginTop: 20, backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#C7C7CC' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff' },
  settingLabel: { fontSize: 17, color: '#000' },
  disabledText: { color: '#C7C7CC' },
   
  inputGroup: { backgroundColor: '#fff', marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#C7C7CC', paddingLeft: 16 },
  settingInput: { height: 50, fontSize: 17, paddingRight: 16 },
  tipsText: { padding: 16, fontSize: 13, color: '#8E8E93' },

  // 🌟 助力功能样式 🌟
  moneyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#007AFF',
    paddingBottom: 8,
    marginBottom: 8,
    width: '60%',
    justifyContent: 'center'
  },
  moneySymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 8
  },
  moneyInput: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
    minWidth: 50,
    textAlign: 'center'
  },
  supportTip: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 24
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 20
  },
  // ✅ 修改：增大了二维码图片尺寸
  qrImage: {
    width: 300,
    height: 300,
    marginBottom: 20,
    borderRadius: 8
  },
  qrText: {
    fontSize: 15,
    color: '#333'
  }
});