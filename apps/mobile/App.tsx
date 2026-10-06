import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { HealthResponse } from '@huahua/shared-types';
import { authApi } from './src/lib/api/auth';
import { request, tokenStore } from './src/lib/api/client';
import { secureStore } from './src/lib/secure-store';

type Screen = 'boot' | 'login' | 'home';

export default function App() {
  const [screen, setScreen] = useState<Screen>('boot');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [healthText, setHealthText] = useState('');

  // 冷启动：恢复 SecureStore 中的 Refresh → 刷新 → 直达首页；失败则回登录
  useEffect(() => {
    void (async () => {
      try {
        const rt = await secureStore.getRefreshToken();
        if (rt) {
          const res = await authApi.refresh(rt);
          tokenStore.set(res.accessToken);
          if (res.refreshToken) await secureStore.setRefreshToken(res.refreshToken);
          setScreen('home');
          return;
        }
      } catch {
        await secureStore.clearRefreshToken();
        tokenStore.set(null);
      }
      setScreen('login');
    })();
  }, []);

  async function onLogin() {
    try {
      const res = await authApi.login({ username, password });
      tokenStore.set(res.accessToken);
      if (res.refreshToken) await secureStore.setRefreshToken(res.refreshToken);
      setScreen('home');
    } catch (e) {
      Alert.alert('登录失败', e instanceof Error ? e.message : '未知错误');
    }
  }

  async function onHealth() {
    try {
      const h = await request<HealthResponse>('/health');
      setHealthText(`API ok · db=${h.db} · v${h.version}`);
    } catch (e) {
      setHealthText(`API 不可达：${e instanceof Error ? e.message : '未知错误'}`);
    }
  }

  async function onLogout() {
    try {
      const rt = await secureStore.getRefreshToken();
      if (rt) await authApi.logout(rt);
    } catch {
      // 幂等：本地清理兜底
    }
    await secureStore.clearRefreshToken();
    tokenStore.set(null);
    setScreen('login');
  }

  if (screen === 'boot') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>启动中…</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === 'home') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>话话成长 · Mobile</Text>
        <Text style={styles.sub}>已登录（Access 内存 / Refresh SecureStore）</Text>
        <Button title="检查 API /health" onPress={onHealth} />
        {healthText ? <Text style={styles.status}>{healthText}</Text> : null}
        <View style={styles.gap} />
        <Button title="退出登录" onPress={onLogout} />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>话话成长 · Mobile</Text>
      <Text style={styles.sub}>P0 · Mobile 直连 Backend API</Text>
      <TextInput
        style={styles.input}
        placeholder="用户名"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        style={styles.input}
        placeholder="密码"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button title="登录" onPress={onLogin} />
      <View style={styles.gap} />
      <Button title="检查 API /health（未登录）" onPress={onHealth} />
      {healthText ? <Text style={styles.status}>{healthText}</Text> : null}
      <Text style={styles.hint}>
        {`提示：Mobile 登录需先在 Web 端注册用户（本机 API ${'http://localhost:3000/api'}）。`}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  sub: { color: '#666', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  status: { marginTop: 12, color: '#333' },
  gap: { height: 8 },
  hint: { marginTop: 24, color: '#999', fontSize: 12 },
});
