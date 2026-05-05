import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import RiderAuth from '../components/RiderAuth';
import RiderDashboard from '../components/RiderDashboard';
import { supabase } from '../supabase';

function LoadingScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#020f09', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#ccfd3a" size="large" />
    </View>
  );
}

export default function RootIndex() {
  const [session, setSession] = useState<any>(null);
  const [rider, setRider] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const hydrateRider = async (nextSession: any) => {
    if (!nextSession?.user?.id) {
      setRider(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone_number, state, city, role')
        .eq('id', nextSession.user.id)
        .maybeSingle();

      if (error) throw error;

      setRider({
        id: nextSession.user.id,
        name: data?.full_name || nextSession.user.email?.split('@')[0] || 'Rider',
        phone: data?.phone_number || '',
        state: data?.state || 'Lagos',
        city: data?.city || 'Ikeja',
        role: data?.role || 'driver',
        terminalCode: (data?.state || 'Lagos').slice(0, 3).toUpperCase(),
        vehicle: 'Motorcycle',
        plate: 'LGA-123-XY',
      });
    } catch (error) {
      console.error('Failed to hydrate rider session', error);
      setRider({
        id: nextSession.user.id,
        name: nextSession.user.email?.split('@')[0] || 'Rider',
        phone: '',
        state: 'Lagos',
        city: 'Ikeja',
        role: 'driver',
        terminalCode: 'LAG',
        vehicle: 'Motorcycle',
        plate: 'LGA-123-XY',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      setSession(nextSession);
      if (nextSession) {
        hydrateRider(nextSession);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        setLoading(true);
        hydrateRider(nextSession);
      } else {
        setRider(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setRider(null);
    setSession(null);
  };

  if (loading) return <LoadingScreen />;

  if (!session || !rider) {
    return <RiderAuth onAuthenticated={() => {}} />;
  }

  return <RiderDashboard rider={rider} onLogout={handleLogout} />;
}
