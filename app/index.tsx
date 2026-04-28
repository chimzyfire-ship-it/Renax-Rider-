// app/index.tsx — RENAX Rider: Root entry point
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import RiderAuth from '../components/RiderAuth';
import RiderDashboard from '../components/RiderDashboard';

export default function RootIndex() {
  const [rider, setRider] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#020f09', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#ccfd3a" size="large" />
      </View>
    );
  }

  if (!rider) {
    return <RiderAuth onAuthenticated={(r: any) => setRider(r)} />;
  }

  return <RiderDashboard rider={rider} onLogout={() => setRider(null)} />;
}
