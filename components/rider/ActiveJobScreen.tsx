// components/rider/ActiveJobScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Image, Linking, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useFonts, PlusJakartaSans_800ExtraBold, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Navigation, CheckCircle2, Package, MapPin, Inbox, ShieldCheck, Camera as CameraIcon, QrCode, PenLine, Wifi, WifiOff, Terminal } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { publishLocation } from '../../utils/locationPublisher';
import { recordShipmentQrScanFailure, stageLabel, updateShipmentStageWithProof, verifyShipmentStageSecure } from '../../utils/routingService';
import { parseRenaxQrPayload, uploadShipmentProofPhoto } from '../../utils/proofMedia';
import { enqueue, registerDrainWorker, queueSize } from '../../utils/offlineQueue';

export default function ActiveJobScreen({ job, rider, onJobComplete }) {
  const [phase, setPhase] = useState<'pickup' | 'deliver' | 'done'>('pickup');
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [proofPhotoUri, setProofPhotoUri] = useState<string | null>(null);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [webScanError, setWebScanError] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const webVideoRef = useRef<any>(null);
  const webStreamRef = useRef<any>(null);
  const webScanIntervalRef = useRef<any>(null);
  // Anti-duplicate & reliability
  const submitLock = useRef(false);
  const [mismatchCount, setMismatchCount] = useState(0);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingQueueSize, setPendingQueueSize] = useState(queueSize());
  // Signature capture
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const signatureCanvasRef = useRef<any>(null);
  const signatureDrawing = useRef(false);
  // Hub scan mode (terminal staff)
  const [hubScanMode, setHubScanMode] = useState(false);
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_8: PlusJakartaSans_800ExtraBold,
    PlusJakartaSans_6: PlusJakartaSans_600SemiBold,
    Outfit_4: Outfit_400Regular,
    Outfit_6: Outfit_600SemiBold,
    Outfit_7: Outfit_700Bold,
  });

  // Network status listener
  useEffect(() => {
    const onOnline  = () => { setIsOnline(true);  setPendingQueueSize(queueSize()); };
    const onOffline = () => setIsOnline(false);
    if (typeof window !== 'undefined') {
      window.addEventListener('online',  onOnline);
      window.addEventListener('offline', onOffline);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online',  onOnline);
        window.removeEventListener('offline', onOffline);
      }
    };
  }, []);

  // Register proof drain worker once
  useEffect(() => {
    registerDrainWorker('proof', async (item) => {
      const p = item.payload as any;
      try {
        if (p?.otp) await verifyShipmentStageSecure(p);
        else await updateShipmentStageWithProof(p);
        return true;
      } catch {
        return false;
      }
    });
  }, []);

  const isRelayToSourceTerminal = job?.routing_mode === 'relay_terminal' && job?.dispatch_stage === 'awaiting_source_terminal';
  const isFinalMileRelay = job?.routing_mode === 'relay_terminal' && (job?.dispatch_stage === 'out_for_delivery' || job?.dispatch_stage === 'awaiting_final_mile_rider');

  const stopWebScanner = () => {
    if (webScanIntervalRef.current) {
      clearInterval(webScanIntervalRef.current);
      webScanIntervalRef.current = null;
    }

    const stream = webStreamRef.current;
    if (stream?.getTracks) {
      stream.getTracks().forEach((track: any) => track.stop());
    }
    webStreamRef.current = null;

    const video = webVideoRef.current;
    if (video) {
      try {
        video.pause?.();
      } catch {
        // ignore
      }
      video.srcObject = null;
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || !scanModalVisible) return;

    let cancelled = false;

    const startWebScanner = async () => {
      setWebScanError('');

      const mediaDevices = globalThis?.navigator?.mediaDevices;
      const BarcodeDetectorCtor = (globalThis as any)?.BarcodeDetector;

      if (!mediaDevices?.getUserMedia) {
        setWebScanError('This browser does not support live camera access for QR scanning.');
        return;
      }

      if (!BarcodeDetectorCtor) {
        setWebScanError('This browser cannot decode QR codes live yet. Use Chrome on Android or enter the OTP manually.');
        return;
      }

      try {
        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
        const stream = await mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track: any) => track.stop());
          return;
        }

        webStreamRef.current = stream;
        const video = webVideoRef.current;
        if (!video) {
          stopWebScanner();
          return;
        }

        video.srcObject = stream;
        await video.play();

        webScanIntervalRef.current = setInterval(async () => {
          if (cancelled || !webVideoRef.current) return;

          try {
            const results = await detector.detect(webVideoRef.current);
            const rawValue = results?.[0]?.rawValue;
            if (rawValue) {
              stopWebScanner();
              handleQrScanned({ data: rawValue });
            }
          } catch {
            // Ignore transient decode errors while frames are warming up.
          }
        }, 700);
      } catch {
        setWebScanError('Camera access was blocked or unavailable. Allow camera access in the browser and try again.');
      }
    };

    startWebScanner();

    return () => {
      cancelled = true;
      stopWebScanner();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanModalVisible]);

  if (!fontsLoaded) return null;

  if (!job) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 36 }]}>
        <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />
        <View style={styles.emptyIconWrap}>
          <Inbox color="rgba(204,253,58,0.5)" size={52} strokeWidth={1} />
        </View>
        <Text style={styles.noJobTitle}>No Active Job</Text>
        <Text style={styles.noJobSub}>Go online on the Home tab to start receiving delivery jobs from dispatch.</Text>
      </View>
    );
  }

  const openMaps = (address: string) => {
    const encoded = encodeURIComponent(address);
    const url = Platform.select({
      ios: `maps://?q=${encoded}`,
      android: `geo:0,0?q=${encoded}`,
      default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    });
    Linking.openURL(url);
  };

  const buildGpsProof = async (stage: 'out_for_delivery' | 'received_at_source_terminal' | 'delivered') => {
    try {
      const locationModule = await import('expo-location');
      const pos = await locationModule.getCurrentPositionAsync({ accuracy: locationModule.Accuracy.Balanced });
      return {
        stage,
        proof_type: 'gps_ping' as const,
        notes: 'Rider device captured live position at milestone confirmation.',
        confidence_score: 0.84,
        metadata: {
          latitude: pos?.coords?.latitude ?? null,
          longitude: pos?.coords?.longitude ?? null,
          accuracy: pos?.coords?.accuracy ?? null,
          speed: pos?.coords?.speed ?? null,
        },
      };
    } catch {
      return {
        stage,
        proof_type: 'system_signal' as const,
        notes: 'Location capture unavailable. Rider confirmed milestone manually.',
        confidence_score: 0.55,
        metadata: { gps_unavailable: true },
      };
    }
  };

  const completeCurrentPhase = async () => {
    // Anti-duplicate: block if a submission is already in flight
    if (submitLock.current) return;
    submitLock.current = true;
    if (!job) { submitLock.current = false; return; }
    setSubmitting(true);
    setOtpError('');

    try {
      let uploadedPhotoUrl: string | null = null;
      if (proofPhotoUri) {
        uploadedPhotoUrl = await uploadShipmentProofPhoto({
          shipmentId: job.id,
          stage: phase === 'pickup' ? (isRelayToSourceTerminal ? 'received_at_source_terminal' : 'out_for_delivery') : 'delivered',
          riderId: rider?.id,
          uri: proofPhotoUri,
        });
        // If upload failed and we're offline, queue it
        if (!uploadedPhotoUrl && !navigator.onLine) {
          uploadedPhotoUrl = proofPhotoUri; // use local URI as placeholder
        }
      }

      if (phase === 'pickup') {
        if (isRelayToSourceTerminal) {
          const gpsProof = await buildGpsProof('received_at_source_terminal');
          const proofParams = {
            shipmentId: job.id,
            stage: 'received_at_source_terminal' as const,
            routingMode: job.routing_mode || 'relay_terminal',
            actorId: rider?.id,
            actorRole: 'rider',
            locationName: rider?.state || 'Terminal',
            notes: 'Rider handed shipment to source terminal staff.',
            proofs: [
              gpsProof,
              { stage: 'received_at_source_terminal' as const, proof_type: 'hub_check_in', notes: 'Relay parcel dropped at source hub queue.', confidence_score: 0.8, media_url: uploadedPhotoUrl },
              ...(signatureDataUrl ? [{ stage: 'received_at_source_terminal' as const, proof_type: 'signature', notes: 'Hub staff signature captured.', confidence_score: 0.95, media_url: signatureDataUrl }] : []),
            ],
          };
          try {
            await updateShipmentStageWithProof(proofParams);
          } catch {
            if (!navigator.onLine) enqueue('proof', proofParams as any);
            else { setOtpError('Network error. Tap again to retry.'); submitLock.current = false; setSubmitting(false); return; }
          }
          setPhase('done');
          setTimeout(onJobComplete, 1800);
          return;
        }

        const gpsProof = await buildGpsProof('out_for_delivery');
        const proofParams = {
          shipmentId: job.id,
          stage: 'out_for_delivery' as const,
          locationName: rider?.state || 'Route',
          notes: 'Rider confirmed pickup and started transit.',
          otp: otpValue.trim(),
          proofs: [
            gpsProof,
            { stage: 'out_for_delivery' as const, proof_type: 'pickup_otp', proof_value: otpValue.trim(), notes: 'Sender pickup OTP verified at handoff.', confidence_score: 0.98, media_url: uploadedPhotoUrl },
            ...(signatureDataUrl ? [{ stage: 'out_for_delivery' as const, proof_type: 'signature', notes: 'Sender signature captured at pickup.', confidence_score: 0.96, media_url: signatureDataUrl }] : []),
          ],
        };
        try {
          await verifyShipmentStageSecure(proofParams);
        } catch (error: any) {
          if (!navigator.onLine) { enqueue('proof', proofParams as any); }
          else {
            setOtpError(error?.message || 'Pickup verification failed. Tap again to retry.');
            submitLock.current = false;
            setSubmitting(false);
            return;
          }
        }
        setPhase('deliver');
        setOtpValue(''); setProofPhotoUri(null); setSignatureDataUrl(null);
        setOtpModalVisible(false); setSubmitting(false);
        submitLock.current = false;
        return;
      }

      const gpsProof = await buildGpsProof('delivered');
      const proofParams = {
        shipmentId: job.id,
        stage: 'delivered' as const,
        locationName: job.delivery_address || rider?.state || 'Destination',
        notes: isFinalMileRelay ? 'Final-mile relay delivery completed.' : 'Local delivery completed.',
        otp: otpValue.trim(),
        proofs: [
          gpsProof,
          { stage: 'delivered' as const, proof_type: 'delivery_otp', proof_value: otpValue.trim(), notes: 'Recipient delivery OTP verified at handoff.', confidence_score: 0.99, media_url: uploadedPhotoUrl },
          ...(signatureDataUrl ? [{ stage: 'delivered' as const, proof_type: 'signature', notes: 'Recipient signature captured at delivery.', confidence_score: 0.96, media_url: signatureDataUrl }] : []),
        ],
      };
      try {
        await verifyShipmentStageSecure(proofParams);
      } catch (error: any) {
        if (!navigator.onLine) { enqueue('proof', proofParams as any); }
        else {
          setOtpError(error?.message || 'Delivery verification failed. Tap again to retry.');
          submitLock.current = false;
          setSubmitting(false);
          return;
        }
      }
      setPhase('done');
      try {
        if (rider?.id) {
          navigator.geolocation?.getCurrentPosition(async (pos) => {
            await publishLocation(rider.id, { lat: pos.coords.latitude, lng: pos.coords.longitude, is_online: true, current_shipment_id: null });
          });
        }
      } catch { /* ignore */ }
      setOtpValue(''); setProofPhotoUri(null); setSignatureDataUrl(null);
      setOtpModalVisible(false);
      setTimeout(onJobComplete, 2500);
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  };

  const beginConfirmation = () => {
    setOtpError('');
    if (phase === 'pickup' && isRelayToSourceTerminal) {
      completeCurrentPhase();
      return;
    }
    setOtpValue('');
    setProofPhotoUri(null);
    setOtpModalVisible(true);
  };

  const captureProofPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setOtpError('Camera access is required to capture proof photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setProofPhotoUri(result.assets[0].uri);
      setOtpError('');
    }
  };

  const startQrScan = async () => {
    setWebScanError('');
    if (!cameraPermission?.granted) {
      if (Platform.OS === 'web') {
        setScanMessage('');
        setScanModalVisible(true);
        return;
      }
      const response = await requestCameraPermission();
      if (!response.granted) {
        setOtpError('Camera permission is required to scan QR proofs.');
        return;
      }
    }
    setScanMessage('');
    setScanModalVisible(true);
  };

  const handleQrScanned = ({ data }: { data: string }) => {
    const parsed = parseRenaxQrPayload(data);
    const jobTrackingId = String(job?.tracking_id || '').trim();
    const failureStage = phase === 'pickup'
      ? (isRelayToSourceTerminal ? 'received_at_source_terminal' : 'out_for_delivery')
      : 'delivered';
    const trackFailure = async (reason: string, scannedTrackingId?: string) => {
      if (!job?.id) return;
      try {
        const result = await recordShipmentQrScanFailure({
          shipmentId: job.id,
          stage: failureStage,
          scannedTrackingId: scannedTrackingId || parsed.trackingId || parsed.value || null,
          reason,
        });
        if (result?.blocked) {
          setOtpError('Too many QR scan failures. Please wait a few minutes and enter the OTP manually.');
        }
      } catch {
        // Keep local mismatch handling even if the server log fails.
      }
    };

    // Mismatch guard — block after 3 wrong scans
    if (mismatchCount >= 3) {
      setOtpError('Too many incorrect QR scans. Please enter the OTP manually.');
      setScanModalVisible(false);
      return;
    }

    if (parsed.trackingId && jobTrackingId && parsed.trackingId !== jobTrackingId) {
      setMismatchCount(c => c + 1);
      void trackFailure('tracking_id_mismatch', parsed.trackingId);
      setOtpError(`Scanned QR belongs to a different shipment. (${mismatchCount + 1}/3 mismatches)`);
      setScanModalVisible(false);
      return;
    }
    if (parsed.kind === 'pickup_otp' || parsed.kind === 'delivery_otp') {
      setOtpValue(parsed.value);
      setScanMessage(`QR recognized as ${parsed.kind === 'pickup_otp' ? 'pickup' : 'delivery'} verification code.`);
      setScanModalVisible(false);
      setMismatchCount(0);
      return;
    }
    if (parsed.kind === 'tracking_id' && parsed.value !== job?.tracking_id) {
      setMismatchCount(c => c + 1);
      void trackFailure('tracking_id_mismatch', parsed.value);
      setOtpError(`Scanned QR belongs to a different shipment. (${mismatchCount + 1}/3 mismatches)`);
      setScanModalVisible(false);
      return;
    }
    // Hub scan mode — just confirm terminal code and close
    if (hubScanMode && parsed.kind === 'terminal_code') {
      setScanMessage(`Hub QR confirmed: ${parsed.value}`);
      setScanModalVisible(false);
      return;
    }
    if (/^\d{4,6}$/.test(parsed.value)) {
      setOtpValue(parsed.value);
      setScanMessage('QR code parsed as numeric verification code.');
      setScanModalVisible(false);
      setMismatchCount(0);
      return;
    }
    void trackFailure('unsupported_qr_payload', parsed.value);
    setOtpError('QR scanned successfully, but it did not contain a usable OTP for this step.');
    setScanModalVisible(false);
  };

  // Signature helpers (web canvas)
  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl(null);
  };

  const saveSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    setSignatureDataUrl(canvas.toDataURL('image/png'));
    setSignatureModalVisible(false);
  };

  if (phase === 'done') {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 36 }]}>
        <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />
        <Animated.View entering={FadeInDown.duration(600)} style={{ alignItems: 'center', gap: 18 }}>
          <View style={styles.doneIconWrap}>
            <CheckCircle2 color="#ccfd3a" size={52} strokeWidth={1.5} />
          </View>
          <Text style={styles.doneTitle}>Job Complete</Text>
          <Text style={styles.doneSub}>You have successfully delivered order {job.id}. Returning to history...</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#020f09', '#041910']} style={StyleSheet.absoluteFillObject as any} />

      {/* Network status bar */}
      {(!isOnline || pendingQueueSize > 0) && (
        <Animated.View entering={FadeInDown.duration(300)} style={[styles.networkBar, isOnline ? styles.networkBarOnline : styles.networkBarOffline]}>
          {isOnline
            ? <Wifi color="#ccfd3a" size={14} />
            : <WifiOff color="#fca5a5" size={14} />}
          <Text style={[styles.networkBarText, !isOnline && { color: '#fca5a5' }]}>
            {isOnline
              ? `Back online — ${pendingQueueSize} queued item${pendingQueueSize !== 1 ? 's' : ''} syncing...`
              : 'Offline — proofs and pings are being queued locally'}
          </Text>
        </Animated.View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <Image source={require('../../assets/images/logo.jpg')} style={styles.logo} resizeMode="contain" />
          <View style={styles.jobIdBadge}>
            <Text style={styles.jobIdText}>#{job.id}</Text>
          </View>
        </Animated.View>

        {/* Progress Steps */}
        <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.progressRow}>
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, styles.stepDotDone]}>
              <CheckCircle2 color="#002B22" size={14} strokeWidth={2.5} />
            </View>
            <Text style={styles.stepLabel}>Assigned</Text>
          </View>
          <View style={[styles.stepLine, phase !== 'pickup' && styles.stepLineDone]} />
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, phase !== 'pickup' ? styles.stepDotDone : styles.stepDotActive]}>
              {phase !== 'pickup'
                ? <CheckCircle2 color="#002B22" size={14} strokeWidth={2.5} />
                : <Text style={styles.stepDotNum}>2</Text>}
            </View>
            <Text style={styles.stepLabel}>Picked Up</Text>
          </View>
          <View style={styles.stepLine} />
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, styles.stepDotInactive]}>
              <Text style={[styles.stepDotNum, { color: 'rgba(255,255,255,0.3)' }]}>3</Text>
            </View>
            <Text style={styles.stepLabel}>Delivered</Text>
          </View>
        </Animated.View>

        {/* Phase Card */}
        <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.phaseCard}>
          <View style={styles.phaseIconWrap}>
            <MapPin color="#ccfd3a" size={32} strokeWidth={1.5} />
          </View>
          <Text style={styles.phaseTitle}>
            {phase === 'pickup'
              ? (isRelayToSourceTerminal ? 'Take the package to the source terminal' : 'Go pick up the package')
              : 'Deliver the package'}
          </Text>
          <Text style={styles.phaseHint}>{stageLabel(job.dispatch_stage || 'awaiting_rider_acceptance')}</Text>

          {/* Visual trust badge */}
          <View style={styles.trustBadgeRow}>
            {phase === 'pickup' && !isRelayToSourceTerminal && (
              <View style={styles.trustBadgeSuggested}>
                <Text style={styles.trustBadgeText}>⬡ Geofence Suggested</Text>
              </View>
            )}
            {phase === 'deliver' && (
              <View style={styles.trustBadgeVerified}>
                <ShieldCheck color="#ccfd3a" size={12} />
                <Text style={[styles.trustBadgeText, { color: '#ccfd3a' }]}>Pickup Verified ✓</Text>
              </View>
            )}
            {isRelayToSourceTerminal && (
              <View style={[styles.trustBadgeSuggested, { borderColor: 'rgba(59,130,246,0.4)', backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                <Terminal color="#60a5fa" size={12} />
                <Text style={[styles.trustBadgeText, { color: '#60a5fa' }]}>Terminal Relay Mode</Text>
              </View>
            )}
          </View>

          <View style={styles.addressBox}>
            <Text style={styles.addressLabel}>{phase === 'pickup' ? (isRelayToSourceTerminal ? 'SOURCE TERMINAL DROP-OFF' : 'PICKUP ADDRESS') : 'DELIVERY ADDRESS'}</Text>
            <Text style={styles.addressValue}>
              {phase === 'pickup'
                ? (isRelayToSourceTerminal ? (job.source_terminal_address || `${job.pickup_state} terminal`) : (job.pickup_address || job.pickup))
                : (job.delivery_address || job.dropoff)}
            </Text>
          </View>

          <Pressable
            style={styles.directionsBtn}
            onPress={() => openMaps(
              phase === 'pickup'
                ? (isRelayToSourceTerminal ? (job.source_terminal_address || `${job.pickup_state} terminal`) : (job.pickup_address || job.pickup))
                : (job.delivery_address || job.dropoff)
            )}
          >
            <Navigation color="#002B22" size={19} strokeWidth={2} />
            <Text style={styles.directionsBtnText}>GET DIRECTIONS</Text>
          </Pressable>

          <View style={styles.divider} />

          <View style={styles.packageRow}>
            <Package color="#ccfd3a" size={16} strokeWidth={1.5} />
            <Text style={styles.packageText}>{job.packageType}  ·  {job.distance}</Text>
          </View>
        </Animated.View>

        {/* Confirm Button */}
        <Animated.View entering={FadeInDown.duration(600).delay(350)} style={{ paddingHorizontal: 24 }}>
          {/* Hub scan mode toggle */}
          {isRelayToSourceTerminal && (
            <Pressable
              style={[styles.hubScanToggle, hubScanMode && styles.hubScanToggleActive]}
              onPress={() => setHubScanMode(v => !v)}
            >
              <Terminal color={hubScanMode ? '#002B22' : '#ccfd3a'} size={16} />
              <Text style={[styles.hubScanToggleText, hubScanMode && { color: '#002B22' }]}>
                {hubScanMode ? 'Hub Scan Mode ON' : 'Enable Hub Scan Mode'}
              </Text>
            </Pressable>
          )}
          {phase === 'pickup' ? (
            <Pressable style={styles.confirmBtn} onPress={beginConfirmation}>
              <CheckCircle2 color="#002B22" size={22} strokeWidth={2.5} />
              <Text style={styles.confirmBtnText}>{isRelayToSourceTerminal ? 'HANDED TO SOURCE HUB' : 'I HAVE PICKED IT UP'}</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.confirmBtn, { backgroundColor: '#10B981' }]} onPress={beginConfirmation}>
              <CheckCircle2 color="#002B22" size={22} strokeWidth={2.5} />
              <Text style={styles.confirmBtnText}>I HAVE DELIVERED IT</Text>
            </Pressable>
          )}
          <Text style={styles.confirmHint}>
            {phase === 'pickup'
              ? (isRelayToSourceTerminal ? 'Only tap this after terminal staff receives the package.' : 'Pickup now requires the sender OTP before the milestone is trusted.')
              : 'Delivery now requires the recipient OTP before the milestone is trusted.'}
          </Text>
        </Animated.View>
      </ScrollView>

      <Modal visible={otpModalVisible} transparent animationType="fade" onRequestClose={() => setOtpModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <ShieldCheck color="#ccfd3a" size={28} />
            </View>
            <Text style={styles.modalTitle}>{phase === 'pickup' ? 'Verify Pickup Proof' : 'Verify Delivery Proof'}</Text>
            <Text style={styles.modalSub}>
              {phase === 'pickup'
                ? 'Enter the sender pickup OTP before marking this shipment as collected.'
                : 'Enter the recipient delivery OTP before completing this shipment.'}
            </Text>
            <View style={styles.proofActionsRow}>
              <Pressable style={styles.proofActionBtn} onPress={captureProofPhoto} disabled={submitting}>
                <CameraIcon color="#ccfd3a" size={16} />
                <Text style={styles.proofActionText}>{proofPhotoUri ? 'Photo ✓' : 'Capture Photo'}</Text>
              </Pressable>
              <Pressable style={styles.proofActionBtn} onPress={startQrScan} disabled={submitting}>
                <QrCode color="#ccfd3a" size={16} />
                <Text style={styles.proofActionText}>Scan QR</Text>
              </Pressable>
              <Pressable style={[styles.proofActionBtn, signatureDataUrl ? { borderColor: 'rgba(16,185,129,0.4)' } : null]} onPress={() => setSignatureModalVisible(true)} disabled={submitting}>
                <PenLine color={signatureDataUrl ? '#10B981' : '#ccfd3a'} size={16} />
                <Text style={styles.proofActionText}>{signatureDataUrl ? 'Sig ✓' : 'Signature'}</Text>
              </Pressable>
            </View>
            {!!scanMessage && <Text style={styles.scanMessage}>{scanMessage}</Text>}
            <TextInput
              style={styles.modalInput}
              value={otpValue}
              onChangeText={setOtpValue}
              keyboardType="number-pad"
              placeholder={requiredOtp ? `Expected ${String(requiredOtp).length}-digit code` : 'Enter verification code'}
              placeholderTextColor="rgba(255,255,255,0.35)"
              editable={!submitting}
            />
            {!!otpError && <Text style={styles.modalError}>{otpError}</Text>}
            <Pressable style={[styles.modalPrimaryBtn, submitting && { opacity: 0.7 }]} onPress={completeCurrentPhase} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#002B22" size="small" /> : <Text style={styles.modalPrimaryText}>VERIFY & CONTINUE</Text>}
            </Pressable>
            <Pressable style={styles.modalSecondaryBtn} onPress={() => setOtpModalVisible(false)} disabled={submitting}>
              <Text style={styles.modalSecondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={scanModalVisible} transparent animationType="fade" onRequestClose={() => setScanModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.scanCard}>
            <Text style={styles.modalTitle}>Scan RENAX QR Proof</Text>
            <Text style={styles.modalSub}>Point the camera at a RENAX OTP or shipment QR code to auto-fill the verification step.</Text>
            <View style={styles.scanViewport}>
              {Platform.OS === 'web' ? (
                webScanError ? (
                  <View style={styles.scanFallback}>
                    <QrCode color="#ccfd3a" size={36} />
                    <Text style={styles.scanFallbackText}>{webScanError}</Text>
                  </View>
                ) : (
                  React.createElement('video', {
                    ref: webVideoRef,
                    autoPlay: true,
                    muted: true,
                    playsInline: true,
                    style: {
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      backgroundColor: '#02140c',
                    },
                  })
                )
              ) : cameraPermission?.granted ? (
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={handleQrScanned}
                />
              ) : (
                <View style={styles.scanFallback}>
                  <QrCode color="#ccfd3a" size={36} />
                  <Text style={styles.scanFallbackText}>Camera permission is required for QR scanning.</Text>
                </View>
              )}
            </View>
            <Pressable style={styles.modalSecondaryBtn} onPress={() => {
              stopWebScanner();
              setScanModalVisible(false);
            }}>
              <Text style={styles.modalSecondaryText}>Close Scanner</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Signature capture modal */}
      <Modal visible={signatureModalVisible} transparent animationType="fade" onRequestClose={() => setSignatureModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 480 }]}>
            <Text style={styles.modalTitle}>Capture Signature</Text>
            <Text style={styles.modalSub}>Draw the recipient or sender signature below.</Text>
            {Platform.OS === 'web' ? (
              React.createElement('canvas', {
                ref: signatureCanvasRef,
                width: 400,
                height: 180,
                style: { background: 'rgba(255,255,255,0.06)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', cursor: 'crosshair', width: '100%' },
                onMouseDown: (e: any) => {
                  signatureDrawing.current = true;
                  const canvas = signatureCanvasRef.current;
                  const ctx = canvas.getContext('2d');
                  const rect = canvas.getBoundingClientRect();
                  ctx.beginPath();
                  ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                },
                onMouseMove: (e: any) => {
                  if (!signatureDrawing.current) return;
                  const canvas = signatureCanvasRef.current;
                  const ctx = canvas.getContext('2d');
                  const rect = canvas.getBoundingClientRect();
                  ctx.strokeStyle = '#ccfd3a';
                  ctx.lineWidth = 2;
                  ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                  ctx.stroke();
                },
                onMouseUp: () => { signatureDrawing.current = false; },
                onTouchStart: (e: any) => {
                  signatureDrawing.current = true;
                  const canvas = signatureCanvasRef.current;
                  const ctx = canvas.getContext('2d');
                  const rect = canvas.getBoundingClientRect();
                  const t = e.touches[0];
                  ctx.beginPath();
                  ctx.moveTo(t.clientX - rect.left, t.clientY - rect.top);
                },
                onTouchMove: (e: any) => {
                  if (!signatureDrawing.current) return;
                  e.preventDefault();
                  const canvas = signatureCanvasRef.current;
                  const ctx = canvas.getContext('2d');
                  const rect = canvas.getBoundingClientRect();
                  const t = e.touches[0];
                  ctx.strokeStyle = '#ccfd3a';
                  ctx.lineWidth = 2;
                  ctx.lineTo(t.clientX - rect.left, t.clientY - rect.top);
                  ctx.stroke();
                },
                onTouchEnd: () => { signatureDrawing.current = false; },
              })
            ) : (
              <View style={{ height: 180, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                <PenLine color="rgba(204,253,58,0.4)" size={32} />
                <Text style={{ color: 'rgba(200,255,220,0.5)', fontFamily: 'Outfit_4', fontSize: 13, marginTop: 8 }}>Signature capture available on web</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <Pressable style={[styles.modalSecondaryBtn, { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12 }]} onPress={clearSignature}>
                <Text style={styles.modalSecondaryText}>Clear</Text>
              </Pressable>
              <Pressable style={[styles.modalPrimaryBtn, { flex: 1 }]} onPress={saveSignature}>
                <Text style={styles.modalPrimaryText}>SAVE SIGNATURE</Text>
              </Pressable>
            </View>
            <Pressable style={styles.modalSecondaryBtn} onPress={() => setSignatureModalVisible(false)}>
              <Text style={styles.modalSecondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020f09' },
  scroll: { flexGrow: 1, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 20 },
  logo: { width: 120, height: 42, ...(Platform.OS === 'web' ? { mixBlendMode: 'screen' } : {}) },
  jobIdBadge: { backgroundColor: 'rgba(204,253,58,0.1)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(204,253,58,0.25)' },
  jobIdText: { fontFamily: 'Outfit_7', fontSize: 13, color: '#ccfd3a', letterSpacing: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginBottom: 28 },
  stepItem: { alignItems: 'center', gap: 6 },
  stepDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: '#ccfd3a' },
  stepDotActive: { backgroundColor: '#10B981' },
  stepDotInactive: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  stepDotNum: { fontFamily: 'Outfit_7', fontSize: 13, color: '#002B22' },
  stepLine: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.12)', marginBottom: 20 },
  stepLineDone: { backgroundColor: '#ccfd3a' },
  stepLabel: { fontFamily: 'Outfit_4', fontSize: 10, color: 'rgba(200,255,220,0.45)', letterSpacing: 0.5 },
  phaseCard: { marginHorizontal: 24, backgroundColor: 'rgba(4,25,16,0.9)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 28, alignItems: 'center', gap: 16, marginBottom: 24 },
  phaseIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(204,253,58,0.1)', borderWidth: 1, borderColor: 'rgba(204,253,58,0.2)', alignItems: 'center', justifyContent: 'center' },
  phaseTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 22, color: '#fff', textAlign: 'center' },
  phaseHint: { fontFamily: 'Outfit_6', fontSize: 12, color: '#ccfd3a', letterSpacing: 1 },
  addressBox: { width: '100%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  addressLabel: { fontFamily: 'Outfit_6', fontSize: 10, color: 'rgba(200,255,220,0.45)', letterSpacing: 1.5, marginBottom: 8 },
  addressValue: { fontFamily: 'PlusJakartaSans_6', fontSize: 15, color: '#fff', lineHeight: 24 },
  directionsBtn: { width: '100%', backgroundColor: '#ccfd3a', borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  directionsBtnText: { fontFamily: 'Outfit_7', fontSize: 15, color: '#002B22', letterSpacing: 1 },
  divider: { width: '100%', height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  packageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  packageText: { fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(200,255,220,0.6)' },
  confirmBtn: { backgroundColor: '#F59E0B', borderRadius: 18, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 14 },
  confirmBtnText: { fontFamily: 'Outfit_7', fontSize: 17, color: '#002B22', letterSpacing: 1 },
  confirmHint: { fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(200,255,220,0.38)', textAlign: 'center', lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,15,9,0.82)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: '#041910', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(204,253,58,0.16)', padding: 24 },
  modalIconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(204,253,58,0.12)', marginBottom: 16, alignSelf: 'center' },
  modalTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 22, color: '#fff', textAlign: 'center', marginBottom: 8 },
  modalSub: { fontFamily: 'Outfit_4', fontSize: 14, lineHeight: 22, color: 'rgba(200,255,220,0.72)', textAlign: 'center', marginBottom: 18 },
  proofActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  proofActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingVertical: 12, paddingHorizontal: 10 },
  proofActionText: { fontFamily: 'Outfit_6', fontSize: 12, color: '#ccfd3a', textAlign: 'center' },
  scanMessage: { fontFamily: 'Outfit_4', fontSize: 12, color: '#a3e635', textAlign: 'center', marginBottom: 8 },
  modalInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 16, paddingVertical: 15, fontFamily: 'PlusJakartaSans_6', fontSize: 18, color: '#fff', textAlign: 'center', letterSpacing: 4, marginBottom: 10 },
  modalError: { fontFamily: 'Outfit_6', fontSize: 13, color: '#fca5a5', textAlign: 'center', marginBottom: 10 },
  modalPrimaryBtn: { backgroundColor: '#ccfd3a', borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 10 },
  modalPrimaryText: { fontFamily: 'Outfit_7', fontSize: 14, color: '#002B22', letterSpacing: 0.8 },
  modalSecondaryBtn: { paddingVertical: 12, alignItems: 'center' },
  modalSecondaryText: { fontFamily: 'Outfit_6', fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  scanCard: { width: '100%', maxWidth: 460, backgroundColor: '#041910', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(204,253,58,0.16)', padding: 20 },
  scanViewport: { width: '100%', height: 320, borderRadius: 18, overflow: 'hidden', backgroundColor: '#02140c', marginTop: 8, marginBottom: 10 },
  scanFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, gap: 12 },
  scanFallbackText: { fontFamily: 'Outfit_4', fontSize: 13, color: 'rgba(200,255,220,0.72)', textAlign: 'center', lineHeight: 20 },
  emptyIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(204,253,58,0.07)', borderWidth: 1, borderColor: 'rgba(204,253,58,0.15)', alignItems: 'center', justifyContent: 'center' },
  noJobTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 26, color: '#fff', textAlign: 'center' },
  noJobSub: { fontFamily: 'Outfit_4', fontSize: 15, color: 'rgba(200,255,220,0.45)', textAlign: 'center', lineHeight: 24, maxWidth: 300 },
  doneIconWrap: { width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(204,253,58,0.08)', borderWidth: 1, borderColor: 'rgba(204,253,58,0.2)', alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontFamily: 'PlusJakartaSans_8', fontSize: 32, color: '#ccfd3a', textAlign: 'center' },
  doneSub: { fontFamily: 'Outfit_4', fontSize: 15, color: 'rgba(200,255,220,0.55)', textAlign: 'center', lineHeight: 24 },
  // Network bar
  networkBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10 },
  networkBarOnline: { backgroundColor: 'rgba(16,185,129,0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(16,185,129,0.2)' },
  networkBarOffline: { backgroundColor: 'rgba(220,38,38,0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(220,38,38,0.2)' },
  networkBarText: { fontFamily: 'Outfit_6', fontSize: 12, color: '#ccfd3a', flex: 1 },
  // Trust badges
  trustBadgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  trustBadgeSuggested: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  trustBadgeVerified: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(204,253,58,0.35)', backgroundColor: 'rgba(204,253,58,0.08)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  trustBadgeText: { fontFamily: 'Outfit_6', fontSize: 11, color: '#F59E0B', letterSpacing: 0.5 },
  // Hub scan toggle
  hubScanToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(204,253,58,0.3)', borderRadius: 12, paddingVertical: 12, marginBottom: 14 },
  hubScanToggleActive: { backgroundColor: '#ccfd3a', borderColor: '#ccfd3a' },
  hubScanToggleText: { fontFamily: 'Outfit_7', fontSize: 14, color: '#ccfd3a' },
});
