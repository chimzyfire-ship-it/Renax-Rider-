// RiderDashboard.tsx — Main Rider App Shell with bottom tab navigation
import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, PlusJakartaSans_800ExtraBold, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import HomeScreen from './rider/HomeScreen';
import ActiveJobScreen from './rider/ActiveJobScreen';
import JobHistoryScreen from './rider/JobHistoryScreen';
import ProfileScreen from './rider/ProfileScreen';
import HelpScreen from './rider/HelpScreen';
import TerminalTasksScreen from './rider/TerminalTasksScreen';
import DeliverAndEarnScreen from './rider/DeliverAndEarnScreen';
import { Home, Briefcase, ClipboardList, User, HelpCircle, Warehouse, Car } from 'lucide-react-native';
import { supabase } from '../supabase';
import { normalizeLogisticsRoles } from '../utils/logisticsRoles';

const TABS = [
  { key: 'home',    Icon: Home,          label: 'Home' },
  { key: 'job',     Icon: Briefcase,     label: 'Active Job' },
  { key: 'deliver_earn', Icon: Car,      label: 'Deliver & Earn' },
  { key: 'terminals', Icon: Warehouse,   label: 'Terminals' },
  { key: 'history', Icon: ClipboardList, label: 'History' },
  { key: 'profile', Icon: User,          label: 'Profile' },
  { key: 'help',    Icon: HelpCircle,    label: 'Help' },
];

const dashboardStateKey = (riderId?: string | null) => `renax:rider-dashboard:${riderId || 'demo'}`;

type RiderDashboardProps = {
  rider?: {
    id?: string | null;
    email?: string | null;
    name?: string;
    phone?: string;
    state?: string;
    city?: string;
    role?: string;
    logisticsRoles?: string[];
    terminalCode?: string;
    preferredTerminalCode?: string;
    assignedTerminalId?: string | null;
    assignedTerminalName?: string;
    assignedTerminalAddress?: string;
    vehicle?: string;
    plate?: string;
  } | null;
  onLogout?: () => void;
};

export default function RiderDashboard({ rider, onLogout }: RiderDashboardProps) {
  const { width } = useWindowDimensions();
  const isWebWide = Platform.OS === 'web' && width >= 768;
  const [activeTab, setActiveTab] = useState('home');
  const [activeJob, setActiveJob] = useState<any>(null);
  const defaultProfile = useMemo(() => ({
    ...rider,
    state: rider?.state || 'Lagos',
    city: rider?.city || 'Ikeja',
    role: rider?.role || 'driver',
    logisticsRoles: normalizeLogisticsRoles(rider?.logisticsRoles, rider?.role),
    terminalCode: rider?.terminalCode || 'LOS',
    preferredTerminalCode: rider?.preferredTerminalCode || rider?.terminalCode || 'LOS',
    assignedTerminalId: rider?.assignedTerminalId || null,
    assignedTerminalName: rider?.assignedTerminalName || '',
    assignedTerminalAddress: rider?.assignedTerminalAddress || '',
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

  useEffect(() => {
    const loadDashboardState = async () => {
      try {
        const stored = await AsyncStorage.getItem(dashboardStateKey(rider?.id));
        const parsed = stored ? JSON.parse(stored) : null;
        const restoredJob = parsed?.activeJob || null;

        let liveAssignedJob = null;
        if (rider?.id) {
          const { data } = await supabase
            .from('shipments')
            .select('*')
            .or(`assigned_rider_id.eq.${rider.id},final_mile_rider_id.eq.${rider.id},first_mile_pickup_agent_id.eq.${rider.id}`)
            .in('dispatch_stage', ['awaiting_rider_acceptance', 'awaiting_source_terminal', 'awaiting_final_mile_rider', 'out_for_delivery'])
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          liveAssignedJob = data || null;
        }

        if (liveAssignedJob) {
          setActiveJob(liveAssignedJob);
          setActiveTab('job');
          return;
        }

        setActiveJob(null);
        if (parsed?.activeTab === 'job' && !restoredJob) {
          setActiveTab('home');
        } else if (parsed?.activeTab) {
          setActiveTab(parsed.activeTab);
        }
      } catch (error) {
        console.error('Failed to restore rider dashboard state', error);
      }
    };

    loadDashboardState();
  }, [rider?.id]);

  useEffect(() => {
    const persistDashboardState = async () => {
      try {
        await AsyncStorage.setItem(
          dashboardStateKey(rider?.id),
          JSON.stringify({
            activeTab,
            activeJob,
          }),
        );
      } catch (error) {
        console.error('Failed to persist rider dashboard state', error);
      }
    };

    persistDashboardState();
  }, [activeJob, activeTab, rider?.id]);

  const persistProfile = async (updates: any) => {
    const nextProfile = {
      ...riderProfile,
      ...updates,
      logisticsRoles: normalizeLogisticsRoles(updates?.logisticsRoles ?? riderProfile?.logisticsRoles, updates?.role ?? riderProfile?.role),
    };
    setRiderProfile(nextProfile);
    try {
      const key = `renax:rider-profile:${rider?.id || 'demo'}`;
      await AsyncStorage.setItem(key, JSON.stringify(nextProfile));
      if (rider?.id) {
        const { error } = await supabase.from('profiles').upsert({
          id: rider.id,
          email: riderProfile?.email || rider?.email || null,
          full_name: nextProfile.name || null,
          phone_number: riderProfile?.phone || rider?.phone || null,
          role: nextProfile.role || 'driver',
          state: nextProfile.state || 'Lagos',
          city: nextProfile.city || 'Ikeja',
          logistics_roles: nextProfile.logisticsRoles,
          preferred_terminal_code: nextProfile.preferredTerminalCode || null,
          is_online: nextProfile.isOnline ?? false,
        });
        if (error) throw error;
      }
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

  const handleJobCancelled = () => {
    setActiveJob(null);
    setActiveTab('home');
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return <HomeScreen rider={riderProfile} onAcceptJob={handleAcceptJob} activeJob={activeJob} />;
      case 'job':
        return activeJob
          ? <ActiveJobScreen job={activeJob} rider={riderProfile} onJobComplete={handleJobComplete} onJobCancelled={handleJobCancelled} />
          : <HomeScreen rider={riderProfile} onAcceptJob={handleAcceptJob} activeJob={activeJob} />;
      case 'deliver_earn':
        return <DeliverAndEarnScreen rider={riderProfile} />;
      case 'terminals':
        return <TerminalTasksScreen rider={riderProfile} onOpenJob={(job: any) => { setActiveJob(job); setActiveTab('job'); }} />;
      case 'history':
        return <JobHistoryScreen rider={riderProfile} />;
      case 'profile':
        return <ProfileScreen rider={riderProfile} onLogout={onLogout} onSaveProfile={persistProfile} />;
      case 'help':
        return <HelpScreen />;
      default:
        return <HomeScreen rider={riderProfile} onAcceptJob={handleAcceptJob} activeJob={activeJob} />;
    }
  };

  return (
    <View style={styles.root}>
      {/* Screen */}
      <View style={[styles.content, isWebWide && styles.contentWeb]}>
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
  contentWeb: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
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
