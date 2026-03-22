import { SafeAreaView, StyleSheet } from 'react-native';
import DroneClickControl from '../components/DroneClickControl';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <DroneClickControl />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000',
  },
});
