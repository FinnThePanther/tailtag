import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { colors, spacing } from '../../src/theme';

const features = [
  {
    title: 'Mobile-first dashboard',
    description:
      'Cards, buttons, and inputs are tuned for thumbs—no pinching or zooming required.',
  },
  {
    title: 'Fast email login',
    description: 'Secure email sign-in keeps your progress ready on any device.',
  },
  {
    title: 'Ready for the floor',
    description:
      'Install TailTag on your phone and keep tagging even when the hotel Wi-Fi is spotty.',
  },
];

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['rgba(56,189,248,0.18)', 'rgba(14,165,233,0.1)', 'transparent']}
        style={styles.backgroundGradient}
        pointerEvents="none"
      />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.brand}>TailTag</Text>
          <Text style={styles.caption}>Trading in session</Text>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.badge}>MVP Preview</Text>
          <Text style={styles.title}>
            Catch fursuits, grow your collection, and keep the con energy going.
          </Text>
          <Text style={styles.subtitle}>
            TailTag makes swapping bespoke suit codes effortless. Add your suits, trade tags on the floor, and watch your collection grow from your phone.
          </Text>
          <View style={styles.ctaRow}>
            <View style={styles.ctaItem}>
              <TailTagButton onPress={() => router.push('/catch')} size="lg">
                Catch a suit
              </TailTagButton>
            </View>
            <View style={styles.ctaItem}>
              <TailTagButton
                variant="outline"
                onPress={() => router.push('/suits/add-fursuit')}
                size="lg"
              >
                Add your suit
              </TailTagButton>
            </View>
          </View>
        </View>

        <TailTagCard style={styles.loopCard}>
          <Text style={styles.sectionEyebrow}>Gameplay Loop</Text>
          <Text style={styles.sectionTitle}>Four quick steps</Text>
          <View>
            {[
              {
                step: '1',
                title: 'Register',
                description: 'Create your TailTag profile in seconds with email login.',
              },
              {
                step: '2',
                title: 'Add suits',
                description: 'Give each fursuit a name, species, and a unique catch code.',
              },
              {
                step: '3',
                title: 'Trade tags',
                description: 'Swap codes with other players out at a convention.',
              },
              {
                step: '4',
                title: 'Log catches',
                description: 'Record new catches instantly and watch your collection fill out.',
              },
            ].map((item, index, array) => (
              <View
                style={[styles.stepRow, index < array.length - 1 && styles.stepRowSpacing]}
                key={item.step}
              >
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{item.step}</Text>
                </View>
                <View style={styles.stepDetails}>
                  <Text style={styles.stepTitle}>{item.title}</Text>
                  <Text style={styles.stepDescription}>{item.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </TailTagCard>

        <View style={styles.featureGrid}>
          {features.map((feature) => (
            <TailTagCard key={feature.title} style={styles.featureCard}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
            </TailTagCard>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const { width } = Dimensions.get('window');
const maxContentWidth = Math.min(width - spacing.lg * 2, 960);

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backgroundGradient: {
    position: 'absolute',
    top: -120,
    left: -60,
    right: -60,
    height: 320,
    borderRadius: 240,
    opacity: 0.6,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  headerRow: {
    width: maxContentWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  brand: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '700',
  },
  caption: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroBlock: {
    width: maxContentWidth,
    marginBottom: spacing.xl,
  },
  badge: {
    alignSelf: 'flex-start',
    color: '#bae6fd',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.4)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 32,
    color: colors.foreground,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(203,213,225,0.9)',
    marginBottom: spacing.lg,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  ctaItem: {
    marginRight: spacing.md,
    marginBottom: spacing.md,
  },
  sectionEyebrow: {
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: '#bae6fd',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 24,
    color: colors.foreground,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  loopCard: {
    width: maxContentWidth,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepRowSpacing: {
    marginBottom: spacing.md,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.4)',
    backgroundColor: 'rgba(56,189,248,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    color: '#bae6fd',
    fontWeight: '700',
  },
  stepDetails: {
    flex: 1,
    marginLeft: spacing.md,
  },
  stepTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  stepDescription: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 14,
  },
  featureGrid: {
    width: maxContentWidth,
    marginTop: spacing.xl,
  },
  featureCard: {
    width: '100%',
    marginBottom: spacing.md,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  featureDescription: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 14,
  },
});

