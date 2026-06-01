import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

const AVATAR_OPTIONS = [
  { name: 'person-circle', color: '#4A90E2' },
  { name: 'person-circle', color: '#FF6B6B' },
  { name: 'person-circle', color: '#51CF66' },
  { name: 'person-circle', color: '#FFD93D' },
  { name: 'person-circle', color: '#9B59B6' },
  { name: 'person-circle', color: '#3498DB' },
];

export default function LoginScreen() {
  const navigation = useNavigation();
  const { loginWithPassword, loginWithCode, register, sendCode, resetPassword } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_OPTIONS[0]);
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    if (!phoneNumber || phoneNumber.length < 11) {
      Alert.alert('提示', '请输入正确的手机号');
      return;
    }

    try {
      const result = await sendCode(phoneNumber);
      setCodeSent(true);
      setCountdown(60);
      // 开发环境或未配置短信服务时显示验证码
      if (result.code) {
        Alert.alert('验证码', `验证码：${result.code}\n\n${result.devMode ? '（开发模式，未配置短信服务）' : '（开发环境）'}`, [
          { text: '确定', onPress: () => setVerificationCode(result.code) }
        ]);
      } else {
        Alert.alert('成功', '验证码已发送到您的手机，请查收');
      }
    } catch (error) {
      Alert.alert('发送失败', error.message);
    }
  };

  const handlePasswordLogin = async () => {
    if (!phoneNumber || phoneNumber.length < 11) {
      Alert.alert('提示', '请输入正确的手机号');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('提示', '密码长度至少6位');
      return;
    }

    try {
      await loginWithPassword(phoneNumber, password);
    } catch (error) {
      Alert.alert('登录失败', error.message);
    }
  };

  const handleCodeLogin = async () => {
    if (!phoneNumber || phoneNumber.length < 11) {
      Alert.alert('提示', '请输入正确的手机号');
      return;
    }
    if (!verificationCode || verificationCode.length !== 6) {
      Alert.alert('提示', '请输入6位验证码');
      return;
    }

    try {
      await loginWithCode(phoneNumber, verificationCode);
    } catch (error) {
      Alert.alert('登录失败', error.message);
    }
  };

  const handleRegister = async () => {
    if (!phoneNumber || phoneNumber.length < 11) {
      Alert.alert('提示', '请输入正确的手机号');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('提示', '密码长度至少6位');
      return;
    }
    if (!nickname || nickname.trim().length === 0) {
      Alert.alert('提示', '请输入昵称');
      return;
    }
    if (!verificationCode || verificationCode.length !== 6) {
      Alert.alert('提示', '请输入6位验证码');
      return;
    }

    try {
      await register(phoneNumber, password, nickname.trim(), selectedAvatar, verificationCode);
      Alert.alert('成功', '注册成功！');
    } catch (error) {
      Alert.alert('注册失败', error.message);
    }
  };

  const handleResetPassword = async () => {
    if (!phoneNumber || phoneNumber.length < 11) {
      Alert.alert('提示', '请输入正确的手机号');
      return;
    }
    if (!verificationCode || verificationCode.length !== 6) {
      Alert.alert('提示', '请输入6位验证码');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('提示', '新密码长度至少6位');
      return;
    }

    try {
      await resetPassword(phoneNumber, verificationCode, newPassword);
      Alert.alert('成功', '密码修改成功，请使用新密码登录');
      setIsForgotPassword(false);
      setVerificationCode('');
      setNewPassword('');
    } catch (error) {
      Alert.alert('修改失败', error.message);
    }
  };

  // 切换登录/注册/忘记密码时重置状态
  const handleToggleMode = (mode) => {
    setIsLogin(mode === 'login');
    setIsForgotPassword(mode === 'forgot');
    setVerificationCode('');
    setCodeSent(false);
    setCountdown(0);
    setPassword('');
    setNewPassword('');
    if (mode === 'register') {
      setNickname('');
      setSelectedAvatar(AVATAR_OPTIONS[0]);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Text style={styles.title}>打卡助手</Text>
          <Text style={styles.subtitle}>记录每一天的坚持</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="请输入手机号"
              value={phoneNumber}
              onChangeText={(text) => {
                setPhoneNumber(text);
                if (!isLogin || isForgotPassword) {
                  setCodeSent(false);
                  setVerificationCode('');
                }
              }}
              keyboardType="phone-pad"
              maxLength={11}
            />

            {isForgotPassword ? (
              <>
                <View style={styles.codeContainer}>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="请输入验证码"
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <TouchableOpacity
                    style={[
                      styles.codeButton,
                      (countdown > 0 || !phoneNumber || phoneNumber.length < 11) && styles.codeButtonDisabled
                    ]}
                    onPress={handleSendCode}
                    disabled={countdown > 0 || !phoneNumber || phoneNumber.length < 11}
                  >
                    <Text style={[
                      styles.codeButtonText,
                      (countdown > 0 || !phoneNumber || phoneNumber.length < 11) && styles.codeButtonTextDisabled
                    ]}>
                      {countdown > 0 ? `${countdown}秒` : codeSent ? '重新获取' : '获取验证码'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="请输入新密码（至少6位）"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                    maxLength={72}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#666" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={handleResetPassword}
                >
                  <Text style={styles.buttonText}>修改密码</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => handleToggleMode('login')}
                >
                  <Text style={styles.linkText}>返回登录</Text>
                </TouchableOpacity>
              </>
            ) : isLogin ? (
              <>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="请输入密码（可选，使用验证码登录）"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    maxLength={72}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#666" />
                  </TouchableOpacity>
                </View>

                {password ? (
                  <TouchableOpacity
                    style={[styles.button, styles.primaryButton]}
                    onPress={handlePasswordLogin}
                  >
                    <Text style={styles.buttonText}>密码登录</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <View style={styles.codeContainer}>
                      <TextInput
                        style={[styles.input, styles.codeInput]}
                        placeholder="请输入验证码"
                        value={verificationCode}
                        onChangeText={setVerificationCode}
                        keyboardType="number-pad"
                        maxLength={6}
                      />
                      <TouchableOpacity
                        style={[
                          styles.codeButton,
                          (countdown > 0 || !phoneNumber || phoneNumber.length < 11) && styles.codeButtonDisabled
                        ]}
                        onPress={handleSendCode}
                        disabled={countdown > 0 || !phoneNumber || phoneNumber.length < 11}
                      >
                        <Text style={[
                          styles.codeButtonText,
                          (countdown > 0 || !phoneNumber || phoneNumber.length < 11) && styles.codeButtonTextDisabled
                        ]}>
                          {countdown > 0 ? `${countdown}秒` : codeSent ? '重新获取' : '获取验证码'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={[styles.button, styles.primaryButton]}
                      onPress={handleCodeLogin}
                      disabled={!verificationCode || verificationCode.length !== 6}
                    >
                      <Text style={styles.buttonText}>验证码登录</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => handleToggleMode('register')}
                >
                  <Text style={styles.linkText}>还没有账号？立即注册</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => handleToggleMode('forgot')}
                >
                  <Text style={styles.linkText}>忘记密码？</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.codeContainer}>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="请输入验证码"
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <TouchableOpacity
                    style={[
                      styles.codeButton,
                      (countdown > 0 || !phoneNumber || phoneNumber.length < 11) && styles.codeButtonDisabled
                    ]}
                    onPress={handleSendCode}
                    disabled={countdown > 0 || !phoneNumber || phoneNumber.length < 11}
                  >
                    <Text style={[
                      styles.codeButtonText,
                      (countdown > 0 || !phoneNumber || phoneNumber.length < 11) && styles.codeButtonTextDisabled
                    ]}>
                      {countdown > 0 ? `${countdown}秒` : codeSent ? '重新获取' : '获取验证码'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="请输入昵称（必填）"
                  value={nickname}
                  onChangeText={setNickname}
                  maxLength={20}
                />

                <TouchableOpacity
                  style={styles.avatarButton}
                  onPress={() => setShowAvatarModal(true)}
                >
                  <View style={styles.avatarPreview}>
                    <Ionicons 
                      name={selectedAvatar.name} 
                      size={40} 
                      color={selectedAvatar.color} 
                    />
                  </View>
                  <Text style={styles.avatarButtonText}>选择头像</Text>
                </TouchableOpacity>

                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="请输入密码（至少6位）"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    maxLength={72}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#666" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={handleRegister}
                >
                  <Text style={styles.buttonText}>注册</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => handleToggleMode('login')}
                >
                  <Text style={styles.linkText}>已有账号？立即登录</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </ScrollView>

      {/* 头像选择Modal */}
      <Modal
        visible={showAvatarModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAvatarModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择头像</Text>
              <TouchableOpacity onPress={() => setShowAvatarModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={styles.avatarGrid}>
              {AVATAR_OPTIONS.map((avatar, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.avatarOption,
                    selectedAvatar.color === avatar.color && styles.avatarOptionSelected
                  ]}
                  onPress={() => {
                    setSelectedAvatar(avatar);
                    setShowAvatarModal(false);
                  }}
                >
                  <Ionicons name={avatar.name} size={50} color={avatar.color} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    minHeight: '100%',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 50,
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  passwordContainer: {
    position: 'relative',
    marginBottom: 15,
  },
  eyeButton: {
    position: 'absolute',
    right: 15,
    top: 16,
    padding: 5,
  },
  codeContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    gap: 10,
  },
  codeInput: {
    flex: 1,
    marginBottom: 0,
  },
  codeButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    minWidth: 100,
  },
  codeButtonDisabled: {
    backgroundColor: '#ccc',
  },
  codeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  codeButtonTextDisabled: {
    color: '#999',
  },
  avatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  avatarPreview: {
    marginRight: 12,
  },
  avatarButtonText: {
    fontSize: 16,
    color: '#333',
  },
  button: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 15,
  },
  primaryButton: {
    backgroundColor: '#4A90E2',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    marginBottom: 15,
  },
  linkText: {
    color: '#4A90E2',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  avatarOption: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarOptionSelected: {
    borderColor: '#4A90E2',
  },
});
