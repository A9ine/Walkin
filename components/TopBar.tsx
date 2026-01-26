import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from './ui/icon-symbol';

interface TopBarProps {
  onLocationChange?: (locationId: string) => void;
}

export function TopBar({ onLocationChange }: TopBarProps) {
  const insets = useSafeAreaInsets();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedLocation, setSelectedLocation] = useState('Main Kitchen');
  const [lastSync, setLastSync] = useState('2 mins ago');
  const [posStatus, setPosStatus] = useState<'connected' | 'needs_attention'>('connected');

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        {/* Location Selector */}
        <TouchableOpacity style={styles.locationSelector}>
          <IconSymbol name="location.fill" size={14} color="#666" />
          <Text style={styles.locationText}>{selectedLocation}</Text>
          <IconSymbol name="chevron.down" size={12} color="#666" />
        </TouchableOpacity>

        {/* Date/Time + Last Sync - Centered */}
        <View style={styles.timeSection}>
          <Text style={styles.dateTime}>
            {formatDate(currentTime)} {formatTime(currentTime)}
          </Text>
          <Text style={styles.lastSync}>Last sync {lastSync}</Text>
        </View>

        {/* POS Status */}
        <View
          style={[
            styles.posStatus,
            posStatus === 'connected' ? styles.connected : styles.needsAttention,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              posStatus === 'connected' ? styles.connectedDot : styles.attentionDot,
            ]}
          />
          <Text
            style={[
              styles.statusText,
              posStatus === 'connected' ? styles.connectedText : styles.attentionText,
            ]}
          >
            {posStatus === 'connected' ? 'Connected' : 'Needs Attention'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  timeSection: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  dateTime: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  lastSync: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  posStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    gap: 5,
  },
  connected: {
    backgroundColor: '#e8f5e9',
  },
  needsAttention: {
    backgroundColor: '#fff3e0',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectedDot: {
    backgroundColor: '#4caf50',
  },
  attentionDot: {
    backgroundColor: '#ff9800',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  connectedText: {
    color: '#2e7d32',
  },
  attentionText: {
    color: '#e65100',
  },
  userMenu: {
    padding: 4,
  },
});
