import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Image, Pressable, ActivityIndicator } from 'react-native';
import { useFonts, PlusJakartaSans_800ExtraBold, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MapPin, Truck, Warehouse, ArrowRightLeft } from 'lucide-react-native';
import { supabase } from '../../supabase';
import { fetchTerminals, stageLabel } from '../../utils/routingService';

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function TerminalTasksScreen({ rider, onOpenJob }: { rider: any; onOpenJob: (job: any) => void }) {
  const [relayJobs, setRelayJobs] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_8: PlusJakartaSans_800ExtraBold,
    PlusJakartaSans_6: PlusJakartaSans_600SemiBold,
    Outfit_4: Outfit_400Regular,
    Outfit_6: Outfit_600SemiBold,
    Outfit_7: Outfit_700Bold,
  });

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [terminalData, { data: shipmentData }] = await Promise.all([
          fetchTerminals(),
          supabase
            .from('shipments')
            .select('*')
            .eq('routing_mode', 'relay_terminal')
            .or(`pickup_state.eq.${rider?.state || 'Lagos'},delivery_state.eq.${rider?.state || 'Lagos'}`)
            .in('dispatch_stage', ['awaiting_rider_acceptance', 'awaiting_source_terminal', 'awaiting_final_mile_rider', 'out_for_delivery'])
            .order('created_at', { ascending: false }),
        ]);

        setTerminals(terminalData);
        setRelayJobs(shipmentData || []);
      } catch (error) {
        console.error('Failed to load terminal tasks', error);
        setRelayJobs([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [rider?.state]);

  if (!fontsLoaded) return null;

  const riderTerminal = terminals.find((terminal) => terminal.state === rider?.state) || terminals.find((terminal) => terminal.code === rider?.terminalCode);

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <Image source={require('../../assets/images/logo.jpg')} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(80)} style={styles.titleWrap}>
          <Text style={styles.screenTitle}>Terminal Tasks</Text>
          <Text style={styles.screenSub}>Relay shipments, hub handoffs, and final-mile releases for {rider?.state || 'your zone'}.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(120)} style={styles.terminalCard}>
          <View style={styles.terminalBadge}>
            <Warehouse color="#ccfd3a" size={18} />
            <Text style={styles.terminalBadgeText}>Assigned Hub</Text>
          </View>
          <Text style={styles.terminalName}>{riderTerminal?.name || `${rider?.state || 'Unknown'} Hub`}</Text>
          <Text style={styles.terminalAddress}>{riderTerminal?.address || 'Terminal address not loaded yet.'}</Text>
        </Animated.View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#ccfd3a" size="large" />
            <Text style={styles.centerStateText}>Loading relay work...</Text>
          </View>
        ) : relayJobs.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.centerStateText}>No relay shipments are waiting in your zone right now.</Text>
          </View>
        ) : (
          relayJobs.map((job, index) => (
            <Animated.View key={job.id} entering={FadeInDown.duration(450).delay(150 + index * 60)} style={styles.jobCard}>
              <View style={styles.jobCardHead}>
                <View>
                  <Text style={styles.jobId}>{job.tracking_id || job.id}</Text>
                  <Text style={styles.jobStage}>{stageLabel(job.dispatch_stage || 'pending_routing')}</Text>
                </View>
                <View style={styles.stagePill}>
                  <Text style={styles.stagePillText}>{job.pickup_state} → {job.delivery_state}</Text>
                </View>
              </View>

              <View style={styles.routeRow}>
                <MapPin color="#ccfd3a" size={16} />
                <Text style={styles.routeText}>{job.pickup_address}</Text>
              </View>
              <View style={styles.routeRow}>
                <ArrowRightLeft color="#ccfd3a" size={16} />
                <Text style={styles.routeText}>{job.delivery_address}</Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaText}>Created {formatDate(job.created_at)}</Text>
                <Text style={styles.metaText}>{job.distance_km ? `${job.distance_km} km` : 'Distance N/A'}</Text>
              </View>

              <Pressable style={styles.openBtn} onPress={() => onOpenJob(job)}>
                <Truck color="#002B22" size={18} />
                <Text style={styles.openBtnText}>Open Task</Text>
              </Pressable>
            </Animated.View>
          ))
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
  titleWrap: { paddingHorizontal: 24, marginBottom: 18 },
  screenTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 30, color: '#fff', marginBottom: 4 },
  screenSub: { fontFamily: 'Outfit_4', fontSize: 15, color: 'rgba(200,255,220,0.5)' },
  terminalCard: { marginHorizontal: 24, marginBottom: 24, backgroundColor: 'rgba(4,25,16,0.85)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 20 },
  terminalBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  terminalBadgeText: { fontFamily: 'Outfit_7', fontSize: 12, color: '#ccfd3a', letterSpacing: 1 },
  terminalName: { fontFamily: 'PlusJakartaSans_6', fontSize: 20, color: '#fff', marginBottom: 8 },
  terminalAddress: { fontFamily: 'Outfit_4', fontSize: 14, color: 'rgba(200,255,220,0.65)', lineHeight: 22 },
  centerState: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
  centerStateText: { fontFamily: 'Outfit_4', fontSize: 14, color: 'rgba(200,255,220,0.5)' },
  jobCard: { marginHorizontal: 24, marginBottom: 14, backgroundColor: 'rgba(4,25,16,0.85)', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  jobCardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  jobId: { fontFamily: 'Outfit_7', fontSize: 15, color: '#ccfd3a' },
  jobStage: { fontFamily: 'Outfit_4', fontSize: 12, color: 'rgba(200,255,220,0.55)', marginTop: 4 },
  stagePill: { backgroundColor: 'rgba(204,253,58,0.12)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  stagePillText: { fontFamily: 'Outfit_6', fontSize: 11, color: '#ccfd3a' },
  routeRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  routeText: { flex: 1, fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(200,255,220,0.8)', lineHeight: 20 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 6, marginBottom: 16, flexWrap: 'wrap' },
  metaText: { fontFamily: 'Outfit_4', fontSize: 12, color: 'rgba(200,255,220,0.45)' },
  openBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ccfd3a', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  openBtnText: { fontFamily: 'Outfit_7', fontSize: 13, color: '#002B22' },
});
