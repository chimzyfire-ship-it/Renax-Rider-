// components/rider/JobHistoryScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Image, ActivityIndicator } from 'react-native';
import { useFonts, PlusJakartaSans_800ExtraBold, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CheckCircle2, XCircle, Clock } from 'lucide-react-native';
import { supabase } from '../../supabase';

const STATUS_CONFIG = {
  completed: { color: '#10B981', label: 'Completed', Icon: CheckCircle2 },
  declined:  { color: '#EF4444', label: 'Declined',  Icon: XCircle },
  'In Transit': { color: '#F59E0B', label: 'In Transit', Icon: Clock },
  'Pending': { color: '#F59E0B', label: 'Pending', Icon: Clock },
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(', ', ', ');
};

const mapStatus = (dbStatus: string) => {
  const statusMap: { [key: string]: string } = {
    'Delivered': 'completed',
    'Pending': 'Pending',
    'In Transit': 'In Transit',
    'Cancelled': 'declined',
  };
  return statusMap[dbStatus] || dbStatus;
};

export default function JobHistoryScreen({ rider }: { rider?: any }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('shipments')
          .select('*')
          .or(`assigned_rider_id.eq.${rider?.id || '00000000-0000-0000-0000-000000000000'},final_mile_rider_id.eq.${rider?.id || '00000000-0000-0000-0000-000000000000'}`)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Failed to fetch jobs:', error);
          setJobs([]);
        } else {
          setJobs(data || []);
        }
      } catch (err) {
        console.error('Error fetching jobs:', err);
        setJobs([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchJobs();
  }, [rider?.id]);

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_8: PlusJakartaSans_800ExtraBold,
    PlusJakartaSans_6: PlusJakartaSans_600SemiBold,
    Outfit_4: Outfit_400Regular,
    Outfit_6: Outfit_600SemiBold,
    Outfit_7: Outfit_700Bold,
  });
  if (!fontsLoaded) return null;

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <Image source={require('../../assets/images/logo.jpg')} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.titleWrap}>
          <Text style={styles.screenTitle}>Job History</Text>
          <Text style={styles.screenSub}>All your past deliveries</Text>
        </Animated.View>

        {/* Summary Strip */}
        <Animated.View entering={FadeInDown.duration(500).delay(150)} style={styles.summaryStrip}>
          {[
            { label: 'Total', value: String(jobs.length) },
            { label: 'Done', value: String(jobs.filter(j => mapStatus(j.status) === 'completed').length) },
            { label: 'Declined', value: String(jobs.filter(j => mapStatus(j.status) === 'declined').length) },
          ].map(({ label, value }) => (
            <View key={label} style={styles.stripItem}>
              <Text style={styles.stripValue}>{value}</Text>
              <Text style={styles.stripLabel}>{label}</Text>
            </View>
          ))}
        </Animated.View>

        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 }}>
            <ActivityIndicator color="#ccfd3a" size="large" />
            <Text style={{ color: '#ccfd3a', marginTop: 12, fontFamily: 'Outfit_4', fontSize: 14 }}>Loading jobs...</Text>
          </View>
        ) : jobs.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 }}>
            <Text style={{ color: 'rgba(200,255,220,0.5)', fontFamily: 'Outfit_4', fontSize: 14 }}>No jobs found</Text>
          </View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.duration(500).delay(200)} style={{ marginHorizontal: 24, marginBottom: 12 }}>
              <Text style={{ color: 'rgba(200,255,220,0.4)', fontFamily: 'Outfit_4', fontSize: 12 }}>
                Displaying the last {Math.min(jobs.length, 50)} job{jobs.length !== 1 ? 's' : ''}
              </Text>
            </Animated.View>
            {/* Job Cards */}
            {jobs.slice(0, 50).map((job, i) => {
              const statusKey = mapStatus(job.status);
              const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.completed;
              const Icon = cfg.Icon;
              return (
                <Animated.View key={job.id} entering={FadeInDown.duration(500).delay(200 + i * 60)} style={styles.jobCard}>
                  <View style={styles.jobCardLeft}>
                    <View style={[styles.statusIcon, { backgroundColor: cfg.color + '22' }]}>
                      <Icon color={cfg.color} size={20} />
                    </View>
                    <View style={styles.jobCardInfo}>
                      <Text style={styles.jobId}>{job.tracking_id || job.id || 'N/A'}</Text>
                      <Text style={styles.jobRoute}>{job.pickup_address} → {job.delivery_address}</Text>
                      <Text style={styles.jobDate}>{formatDate(job.created_at)}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusPill, { borderColor: cfg.color + '55', backgroundColor: cfg.color + '15' }]}>
                    <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </Animated.View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020f09' },
  scroll: { flexGrow: 1, paddingBottom: 60 },
  header: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  logo: { width: 120, height: 42, ...(Platform.OS === 'web' ? { mixBlendMode: 'screen' } : {}) },
  titleWrap: { paddingHorizontal: 24, marginBottom: 20 },
  screenTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 30, color: '#fff', marginBottom: 4 },
  screenSub: { fontFamily: 'Outfit_4', fontSize: 15, color: 'rgba(200,255,220,0.5)' },
  summaryStrip: { flexDirection: 'row', marginHorizontal: 24, backgroundColor: 'rgba(4,25,16,0.85)', borderRadius: 16, padding: 18, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', gap: 0 },
  stripItem: { flex: 1, alignItems: 'center', gap: 4 },
  stripValue: { fontFamily: 'PlusJakartaSans_8', fontSize: 26, color: '#ccfd3a' },
  stripLabel: { fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(200,255,220,0.55)' },
  jobCard: { marginHorizontal: 24, marginBottom: 12, backgroundColor: 'rgba(4,25,16,0.85)', borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  jobCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  statusIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  jobCardInfo: { flex: 1, gap: 3 },
  jobId: { fontFamily: 'Outfit_7', fontSize: 14, color: '#ccfd3a', letterSpacing: 0.5 },
  jobRoute: { fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(200,255,220,0.8)', lineHeight: 20 },
  jobDate: { fontFamily: 'Outfit_4', fontSize: 12, color: 'rgba(200,255,220,0.4)' },
  statusPill: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontFamily: 'Outfit_6', fontSize: 12 },
});
