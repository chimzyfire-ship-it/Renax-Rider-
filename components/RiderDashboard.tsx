// RiderDashboard.tsx — Main Rider App Shell with bottom tab navigation
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, PlusJakartaSans_800ExtraBold, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import HomeScreen from './rider/HomeScreen';
import ActiveJobScreen from './rider/ActiveJobScreen';
import JobHistoryScreen from './rider/JobHistoryScreen';
import ProfileScreen from './rider/ProfileScreen';
import HelpScreen from './rider/HelpScreen';
import TerminalTasksScreen from './rider/TerminalTasksScreen';
import { Home, Briefcase, ClipboardList, User, HelpCircle, Warehouse } from 'lucide-react-native';

const TABS = [
  { key: 'home',    Icon: Home,          label: 'Home' },
  { key: 'job',     Icon: Briefcase,     label: 'Active Job' },
  { key: 'terminals', Icon: Warehouse,   label: 'Terminals' },
  { key: 'history', Icon: ClipboardList, label: 'History' },
  { key: 'profile', Icon: User,          label: 'Profile' },
  { key: 'help',    Icon: HelpCircle,    label: 'Help' },
];

export default function RiderDashboard({ rider, onLogout }) {
  const [activeTab, setActiveTab] = useState('home');
  const [activeJob, setActiveJob] = useState<any>(null);
  const defaultProfile = useMemo(() => ({
    ...rider,
    state: rider?.state || 'Lagos',
    city: rider?.city || 'Ikeja',
    terminalCode: rider?.terminalCode || 'LOS',
    vehicle: rider?.vehicle || 'Motorcycle',
    plate: rider?.plate || 'LGA-123-XY',
  }), [rider]);
  const [riderProfile, setRiderProfile] = useState<any>(defaultProfile);

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_8: PlusJakartaSans_800ExtraBold,
    PlusJakartaSans_6: PlusJakartaSans_600SemiBold,
    Outfit_4: Outfit_400Regular,
    Outfit_6: Outfit_600SemiBold,
    Outfit_7: Outfit_700Bold,
  });

  useEffect(() => {
    const loadPersistedProfile = async () => {
      try {
        const key = `renax:rider-profile:${rider?.id || 'demo'}`;
        const stored = await AsyncStorage.getItem(key);
        if (!stored) {
          setRiderProfile(defaultProfile);
          return;
        }
        const parsed = JSON.parse(stored);
        setRiderProfile((current: any) => ({ ...current, ...parsed }));
      } catch {
        setRiderProfile(defaultProfile);
      }
    };

    loadPersistedProfile();
  }, [defaultProfile, rider?.id]);

  const persistProfile = async (updates: any) => {
    const nextProfile = { ...riderProfile, ...updates };
    setRiderProfile(nextProfile);
    try {
      const key = `renax:rider-profile:${rider?.id || 'demo'}`;
      await AsyncStorage.setItem(key, JSON.stringify(nextProfile));
    } catch (error) {
      console.error('Failed to persist rider profile', error);
    }
  };

  if (!fontsLoaded) return null;

  const handleAcceptJob = (job: any) => {
    setActiveJob(job);
    setActiveTab('job');
  };

  const handleJobComplete = () => {
    setActiveJob(null);
    setActiveTab('history');
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return <HomeScreen rider={riderProfile} onAcceptJob={handleAcceptJob} />;
      case 'job':
        return <ActiveJobScreen job={activeJob} rider={riderProfile} onJobComplete={handleJobComplete} />;
      case 'terminals':
        return <TerminalTasksScreen rider={riderProfile} onOpenJob={(job: any) => { setActiveJob(job); setActiveTab('job'); }} />;
      case 'history':
        return <JobHistoryScreen rider={riderProfile} />;
      case 'profile':
        return <ProfileScreen rider={riderProfile} onLogout={onLogout} onSaveProfile={persistProfile} />;
      case 'help':
        return <HelpScreen />;
      default:
        return <HomeScreen rider={riderProfile} onAcceptJob={handleAcceptJob} />;
    }
  };

  return (
    <View style={styles.root}>
      {/* Screen */}
      <View style={styles.content}>
        {renderScreen()}
      </View>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map(({ key, Icon, label }) => {
          const isActive = activeTab === key;
          return (
            <View
              key={key}
              style={styles.tabItem}
            >
              {/* Indicator dot */}
              {isActive && <View style={styles.tabDot} />}
              <View
                style={[styles.tabIconWrap, isActive && styles.tabIconWrapActive]}
              >
                <Icon
                  color={isActive ? '#002B22' : 'rgba(255,255,255,0.35)'}
                  size={22}
                  onPress={() => setActiveTab(key)}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020f09',
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#041910',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    paddingTop: 10,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  tabDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ccfd3a',
    marginBottom: 2,
  },
  tabIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: {
    backgroundColor: '#ccfd3a',
  },
});
