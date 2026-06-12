import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CheckCircle2, Package, Power, RefreshCw, ShieldCheck, XCircle } from 'lucide-react-native';
import {
  claimDeliverAndEarnOffer,
  completeDeliverAndEarnDelivery,
  completeDeliverAndEarnPickup,
  declineDeliverAndEarnOffer,
  fetchDeliverAndEarnSnapshot,
  setDeliverAndEarnOnline,
  type DeliverAndEarnOffer,
  type DeliverAndEarnSnapshot,
} from '../../utils/deliverAndEarn';

const formatAmount = (amount: number | null | undefined) =>
  `₦${Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const statusLabel = (value?: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Not Started';

const SNAPSHOT_LOAD_TIMEOUT_MS = 10000;

export default function DeliverAndEarnScreen({ rider }: { rider?: { id?: string | null; name?: string } | null }) {
  const operatorId = rider?.id || null;
  const [snapshot, setSnapshot] = useState<DeliverAndEarnSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [pickupOtp, setPickupOtp] = useState('');
  const [deliveryOtp, setDeliveryOtp] = useState('');

  const loadSnapshot = useCallback(async (options?: { silent?: boolean }) => {
    if (!operatorId) return;
    if (!options?.silent) setLoading(true);
    try {
      const data = await Promise.race([
        fetchDeliverAndEarnSnapshot(operatorId),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Deliver & Earn data load timed out. Pull refresh again or check your connection.')), SNAPSHOT_LOAD_TIMEOUT_MS);
        }),
      ]);
      setSnapshot(data);
      setMessage('');
    } catch (error) {
      console.error('Failed to load Deliver & Earn rider data', error);
      if (!options?.silent) {
        setMessage(error instanceof Error ? error.message : 'Deliver & Earn is not ready on this backend yet.');
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [operatorId]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const primaryVehicle = snapshot?.vehicles[0] ?? null;
  const isApproved = snapshot?.profile?.application_status === 'approved' && snapshot.profile.operator_status === 'active';
  const isOnline = Boolean(snapshot?.availability?.is_online);
  const activeShipment = snapshot?.activeShipment ?? null;

  useEffect(() => {
    if (!operatorId || !isApproved || !isOnline) return;

    let stopped = false;
    const vehicleId = snapshot?.availability?.vehicle_id || primaryVehicle?.id || null;

    const refreshOnlinePresence = async () => {
      try {
        await setDeliverAndEarnOnline(true, vehicleId);
        if (!stopped) {
          await loadSnapshot({ silent: true });
        }
      } catch (error) {
        console.error('Deliver & Earn online heartbeat failed', error);
      }
    };

    refreshOnlinePresence();
    const interval = setInterval(refreshOnlinePresence, 5000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [isApproved, isOnline, loadSnapshot, operatorId, primaryVehicle?.id, snapshot?.availability?.vehicle_id]);

  const readiness = useMemo(() => {
    const profile = snapshot?.profile;
    if (!profile) return ['No Deliver & Earn application found'];
    const checks = [
      ['Application', profile.application_status === 'approved'],
      ['Operator', profile.operator_status === 'active'],
      ['Identity', profile.identity_status === 'verified'],
      ['Licence', profile.licence_status === 'verified'],
      ['Training', profile.training_status === 'completed'],
      ['Bank', profile.bank_status === 'verified'],
      ['Vehicle', primaryVehicle?.vehicle_status === 'active' && primaryVehicle.inspection_status === 'verified'],
    ];
    return checks.filter(([, passed]) => !passed).map(([label]) => String(label));
  }, [primaryVehicle, snapshot?.profile]);

  const handleOnline = async () => {
    if (!isApproved) return;
    setBusyId('online');
    setMessage('');
    try {
      await setDeliverAndEarnOnline(!isOnline, primaryVehicle?.id);
      await loadSnapshot();
    } catch (error) {
      console.error('Deliver & Earn online failed', error);
      setMessage(error instanceof Error ? error.message : 'Could not update Deliver & Earn online status.');
    } finally {
      setBusyId('');
    }
  };

  const handleClaim = async (offer: DeliverAndEarnOffer) => {
    setBusyId(`claim:${offer.id}`);
    setMessage('');
    try {
      await claimDeliverAndEarnOffer(offer.id);
      await loadSnapshot();
    } catch (error) {
      console.error('Deliver & Earn claim failed', error);
      setMessage(error instanceof Error ? error.message : 'Could not accept offer.');
    } finally {
      setBusyId('');
    }
  };

  const handleDecline = async (offer: DeliverAndEarnOffer) => {
    setBusyId(`decline:${offer.id}`);
    setMessage('');
    try {
      await declineDeliverAndEarnOffer(offer.id);
      await loadSnapshot();
    } catch (error) {
      console.error('Deliver & Earn decline failed', error);
      setMessage(error instanceof Error ? error.message : 'Could not decline offer.');
    } finally {
      setBusyId('');
    }
  };

  const handlePickup = async () => {
    if (!activeShipment) return;
    setBusyId('pickup');
    setMessage('');
    try {
      await completeDeliverAndEarnPickup(activeShipment.id, pickupOtp);
      setPickupOtp('');
      await loadSnapshot();
    } catch (error) {
      console.error('Deliver & Earn pickup proof failed', error);
      setMessage(error instanceof Error ? error.message : 'Could not verify pickup.');
    } finally {
      setBusyId('');
    }
  };

  const handleDelivery = async () => {
    if (!activeShipment) return;
    setBusyId('delivery');
    setMessage('');
    try {
      await completeDeliverAndEarnDelivery(activeShipment.id, deliveryOtp);
      setDeliveryOtp('');
      await loadSnapshot();
    } catch (error) {
      console.error('Deliver & Earn delivery proof failed', error);
      setMessage(error instanceof Error ? error.message : 'Could not complete delivery.');
    } finally {
      setBusyId('');
    }
  };

  if (loading && !snapshot) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />
        <View style={styles.centerState}>
          <ActivityIndicator color="#ccfd3a" size="large" />
          <Text style={styles.centerText}>Loading Deliver & Earn...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(450)} style={styles.header}>
          <View>
            <Text style={styles.pageTitle}>Deliver & Earn</Text>
            <Text style={styles.pageSub}>Approved personal-car owners carry RENAX intra-state shipments and earn per completed delivery.</Text>
          </View>
          <Pressable style={styles.refreshBtn} onPress={() => loadSnapshot()}>
            <RefreshCw size={16} color="#002B22" />
          </Pressable>
        </Animated.View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        {!snapshot?.profile ? (
          <View style={styles.panel}>
            <ShieldCheck color="#ccfd3a" size={28} />
            <Text style={styles.panelTitle}>Apply from the Customer app</Text>
            <Text style={styles.panelText}>Use the Customer app Deliver & Earn tab to register your personal car and submit validation details. Once RENAX approves you, jobs will appear here.</Text>
          </View>
        ) : (
          <>
            <View style={styles.statusGrid}>
              <View style={styles.statusCard}>
                <Text style={styles.cardLabel}>Application</Text>
                <Text style={styles.cardValue}>{statusLabel(snapshot.profile.application_status)}</Text>
              </View>
              <View style={styles.statusCard}>
                <Text style={styles.cardLabel}>Vehicle</Text>
                <Text style={styles.cardValue}>{primaryVehicle?.plate_number || 'Pending'}</Text>
              </View>
              <View style={styles.statusCard}>
                <Text style={styles.cardLabel}>Available</Text>
                <Text style={styles.cardValue}>{formatAmount(snapshot.availableBalance)}</Text>
              </View>
              <View style={styles.statusCard}>
                <Text style={styles.cardLabel}>Pending</Text>
                <Text style={styles.cardValue}>{formatAmount(snapshot.pendingBalance)}</Text>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.panelTitle}>Dispatch Status</Text>
                  <Text style={styles.panelText}>
                    {isApproved
                      ? isOnline ? 'You are online for Deliver & Earn offers.' : 'Go online when your car is ready.'
                      : `Blocked until: ${readiness.join(', ')}`}
                  </Text>
                </View>
                <Pressable
                  style={[styles.onlineBtn, isOnline && styles.onlineBtnActive, !isApproved && styles.disabledBtn]}
                  onPress={handleOnline}
                  disabled={!isApproved || busyId === 'online'}
                >
                  {busyId === 'online' ? <ActivityIndicator color={isOnline ? '#fff' : '#002B22'} /> : <Power size={18} color={isOnline ? '#fff' : '#002B22'} />}
                  <Text style={[styles.onlineBtnText, isOnline && styles.onlineBtnTextActive]}>{isOnline ? 'Go Offline' : 'Go Online'}</Text>
                </Pressable>
              </View>
            </View>

            {activeShipment ? (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Active Shipment</Text>
                <Text style={styles.shipmentId}>{activeShipment.tracking_id || activeShipment.id}</Text>
                <Text style={styles.routeText}>{activeShipment.pickup_address || 'Pickup'} to {activeShipment.delivery_address || 'Delivery'}</Text>
                <Text style={styles.earningText}>Your payout: {formatAmount(activeShipment.carrier_commission_amount)}</Text>

                <View style={styles.proofBlock}>
                  <Text style={styles.cardLabel}>Pickup OTP</Text>
                  <View style={styles.proofRow}>
                    <TextInput value={pickupOtp} onChangeText={setPickupOtp} placeholder="Pickup code" placeholderTextColor="#4B6B58" style={styles.otpInput} keyboardType="numeric" />
                    <Pressable style={styles.proofBtn} onPress={handlePickup} disabled={busyId === 'pickup'}>
                      <Package size={16} color="#002B22" />
                      <Text style={styles.proofBtnText}>Verify Pickup</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.proofBlock}>
                  <Text style={styles.cardLabel}>Delivery OTP</Text>
                  <View style={styles.proofRow}>
                    <TextInput value={deliveryOtp} onChangeText={setDeliveryOtp} placeholder="Delivery code" placeholderTextColor="#4B6B58" style={styles.otpInput} keyboardType="numeric" />
                    <Pressable style={styles.proofBtn} onPress={handleDelivery} disabled={busyId === 'delivery'}>
                      <CheckCircle2 size={16} color="#002B22" />
                      <Text style={styles.proofBtnText}>Complete</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Job Offers</Text>
              {(snapshot.offers ?? []).length === 0 ? (
                <Text style={styles.panelText}>{isOnline ? 'No current offers. Stay online for eligible intra-state shipments.' : 'Go online to receive offers after approval.'}</Text>
              ) : (
                <View style={{ gap: 12 }}>
                  {snapshot.offers.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      busyId={busyId}
                      onClaim={handleClaim}
                      onDecline={handleDecline}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function OfferCard({
  offer,
  busyId,
  onClaim,
  onDecline,
}: {
  offer: DeliverAndEarnOffer;
  busyId: string;
  onClaim: (offer: DeliverAndEarnOffer) => void;
  onDecline: (offer: DeliverAndEarnOffer) => void;
}) {
  const shipment = offer.shipments;
  return (
    <View style={styles.offerCard}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.shipmentId}>{shipment?.tracking_id || offer.shipment_id}</Text>
        <Text style={styles.routeText}>{shipment?.pickup_address || 'Pickup'} to {shipment?.delivery_address || 'Delivery'}</Text>
        <Text style={styles.earningText}>Expected payout: {formatAmount(shipment?.carrier_commission_amount)}</Text>
      </View>
      <View style={styles.offerActions}>
        <Pressable style={styles.acceptBtn} onPress={() => onClaim(offer)} disabled={busyId === `claim:${offer.id}`}>
          <CheckCircle2 size={15} color="#002B22" />
          <Text style={styles.acceptBtnText}>Accept</Text>
        </Pressable>
        <Pressable style={styles.declineBtn} onPress={() => onDecline(offer)} disabled={busyId === `decline:${offer.id}`}>
          <XCircle size={15} color="#EF4444" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020f09' },
  scroll: { padding: 24, paddingBottom: 90, gap: 16 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerText: { fontFamily: 'Outfit_4', color: 'rgba(200,255,220,0.7)' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6 },
  pageTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 30, color: '#fff' },
  pageSub: { fontFamily: 'Outfit_4', fontSize: 14, color: 'rgba(200,255,220,0.62)', lineHeight: 21, marginTop: 5, maxWidth: 680 },
  refreshBtn: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ccfd3a' },
  message: { color: '#FCD34D', fontFamily: 'Outfit_4', fontSize: 13, lineHeight: 20, backgroundColor: 'rgba(146,64,14,0.2)', borderWidth: 1, borderColor: 'rgba(252,211,77,0.25)', borderRadius: 12, padding: 12 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statusCard: { flex: 1, minWidth: 145, backgroundColor: 'rgba(4,25,16,0.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 },
  cardLabel: { fontFamily: 'Outfit_6', color: 'rgba(200,255,220,0.48)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { fontFamily: 'PlusJakartaSans_7', color: '#ccfd3a', fontSize: 18, marginTop: 7 },
  panel: { backgroundColor: 'rgba(4,25,16,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 18, gap: 12 },
  panelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  panelTitle: { fontFamily: 'PlusJakartaSans_7', color: '#fff', fontSize: 19 },
  panelText: { fontFamily: 'Outfit_4', color: 'rgba(200,255,220,0.66)', fontSize: 13, lineHeight: 20 },
  onlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ccfd3a', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minWidth: 112 },
  onlineBtnActive: { backgroundColor: '#047857' },
  onlineBtnText: { fontFamily: 'Outfit_7', color: '#002B22', fontSize: 13 },
  onlineBtnTextActive: { color: '#fff' },
  disabledBtn: { opacity: 0.45 },
  shipmentId: { fontFamily: 'Outfit_7', color: '#ccfd3a', fontSize: 14 },
  routeText: { fontFamily: 'Outfit_4', color: 'rgba(200,255,220,0.78)', fontSize: 13, lineHeight: 20, marginTop: 4 },
  earningText: { fontFamily: 'Outfit_6', color: '#fff', fontSize: 13, marginTop: 6 },
  proofBlock: { gap: 7 },
  proofRow: { flexDirection: 'row', gap: 10 },
  otpInput: { flex: 1, borderWidth: 1, borderColor: 'rgba(204,253,58,0.18)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontFamily: 'Outfit_6', color: '#fff', backgroundColor: 'rgba(255,255,255,0.04)' },
  proofBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#ccfd3a', borderRadius: 12, paddingHorizontal: 12 },
  proofBtnText: { fontFamily: 'Outfit_7', color: '#002B22', fontSize: 12 },
  offerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', padding: 14 },
  offerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ccfd3a', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  acceptBtnText: { fontFamily: 'Outfit_7', color: '#002B22', fontSize: 12 },
  declineBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
});
