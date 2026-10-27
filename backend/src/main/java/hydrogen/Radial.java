package hydrogen;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Radial part of a hydrogen-like orbital, in the length unit sigma = Z r / a0.
 *
 * <pre>
 *   R_nl(sigma) = N_nl * exp(-sigma/n) * x^l * L_{n-l-1}^{2l+1}(x),   x = 2 sigma / n
 *   N_nl        = (2/n)^(3/2) * sqrt( (n-l-1)! / (2 n (n+l)!) )
 * </pre>
 *
 * The factor (Z/a0)^(3/2) is left out, so R is dimensionless and independent of Z, and
 * the integral of R^2 sigma^2 d(sigma) over 0..infinity is 1. L is the modern associated Laguerre
 * polynomial, L_p^k(x) = sum_j (-1)^j C(p+k, p-j) x^j / j!.
 */
public final class Radial {
    private Radial() {}

    private static final double[] FACT = new double[30];

    static {
        FACT[0] = 1;
        for (int i = 1; i < FACT.length; i++) FACT[i] = FACT[i - 1] * i;
    }

    /** Associated Laguerre polynomial L_p^k(x) by the stable three-term recurrence. */
    public static double laguerre(int p, int k, double x) {
        if (p == 0) return 1.0;
        double a = 1.0, b = 1.0 + k - x;
        for (int j = 1; j < p; j++) {
            double c = ((2 * j + 1 + k - x) * b - (j + k) * a) / (j + 1);
            a = b;
            b = c;
        }
        return b;
    }

    public static double normalization(int n, int l) {
        return Math.pow(2.0 / n, 1.5) * Math.sqrt(FACT[n - l - 1] / (2.0 * n * FACT[n + l]));
    }

    public static double value(int n, int l, double sigma) {
        double x = 2.0 * sigma / n;
        return normalization(n, l) * Math.exp(-sigma / n) * Math.pow(x, l) * laguerre(n - l - 1, 2 * l + 1, x);
    }

    /** Radial probability density in sigma: P(sigma) = sigma^2 R^2, which integrates to 1. */
    public static double probability(int n, int l, double sigma) {
        double r = value(n, l, sigma);
        return sigma * sigma * r * r;
    }

    /** Mean of sigma, in closed form: (3 n^2 - l (l + 1)) / 2. */
    public static double meanSigma(int n, int l) {
        return (3.0 * n * n - l * (l + 1.0)) / 2.0;
    }

    /** Everything about one (n, l) pair that is computed once: nodes, peak, extent and the CDF used for sampling. */
    public static final class Info {
        public final int n, l;
        /** Radii (in sigma) where R changes sign; there are n - l - 1 of them. */
        public final double[] nodes;
        /** Most probable sigma (global maximum of sigma^2 R^2). */
        public final double peak;
        /** The radius (in sigma) that holds 99.9 % of the probability: the size of the drawing. */
        public final double extent;
        /** Total probability found by the numerical integration (should be 1). */
        public final double total;
        private final double[] cdf;
        private final double step;

        Info(int n, int l) {
            this.n = n;
            this.l = l;
            final int m = 200000;
            double bound = 4.0 * n * n + 60.0;
            step = bound / m;
            cdf = new double[m + 1];
            double prev = 0.0, best = -1.0, bestS = 0.0;
            for (int i = 1; i <= m; i++) {
                double s = i * step, p = probability(n, l, s);
                cdf[i] = cdf[i - 1] + 0.5 * (prev + p) * step;
                if (p > best) {
                    best = p;
                    bestS = s;
                }
                prev = p;
            }
            total = cdf[m];
            for (int i = 0; i <= m; i++) cdf[i] /= total;
            peak = bestS;
            extent = quantile(0.999);
            nodes = findNodes(n, l);
        }

        /** Inverse of the cumulative radial probability: the sigma below which a fraction u of the probability lies. */
        public double quantile(double u) {
            int lo = 0, hi = cdf.length - 1;
            while (lo < hi) {
                int mid = (lo + hi) >>> 1;
                if (cdf[mid] >= u) hi = mid;
                else lo = mid + 1;
            }
            if (lo == 0) return 0.0;
            double c0 = cdf[lo - 1], c1 = cdf[lo];
            double t = c1 > c0 ? (u - c0) / (c1 - c0) : 0.0;
            return (lo - 1 + t) * step;
        }
    }

    private static double[] findNodes(int n, int l) {
        int p = n - l - 1, k = 2 * l + 1;
        if (p == 0) return new double[0];
        double xmax = 4.0 * p + 2.0 * k + 6.0, dx = 0.0005;
        List<Double> roots = new ArrayList<>();
        double xPrev = dx, fPrev = laguerre(p, k, xPrev);
        for (double x = 2 * dx; x <= xmax; x += dx) {
            double f = laguerre(p, k, x);
            if ((fPrev < 0 && f > 0) || (fPrev > 0 && f < 0)) {
                double a = xPrev, b = x, fa = fPrev;
                for (int it = 0; it < 80; it++) {
                    double mid = 0.5 * (a + b), fm = laguerre(p, k, mid);
                    if ((fa < 0) == (fm < 0)) {
                        a = mid;
                        fa = fm;
                    } else {
                        b = mid;
                    }
                }
                roots.add(0.5 * n * 0.5 * (a + b));      // sigma = n x / 2
            }
            xPrev = x;
            fPrev = f;
        }
        double[] out = new double[roots.size()];
        for (int i = 0; i < out.length; i++) out[i] = roots.get(i);
        return out;
    }

    private static final Map<Integer, Info> CACHE = new ConcurrentHashMap<>();

    public static Info info(int n, int l) {
        return CACHE.computeIfAbsent(n * 10 + l, key -> new Info(n, l));
    }
}
