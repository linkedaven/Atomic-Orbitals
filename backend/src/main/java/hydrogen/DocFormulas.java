package hydrogen;

import java.util.ArrayList;
import java.util.List;

/**
 * The closed-form radial functions exactly as printed in "Hydrogen-like Orbitals: 1s to 8s":
 *
 * <pre>
 *   R_nl(sigma) = (Z/a0)^(3/2) * (k * sqrt(s) / d) * sigma^l * poly(sigma) * exp(-sigma/n)
 * </pre>
 *
 * The program itself computes R from the Laguerre formula in {@link Radial}. This table is a second,
 * independent route to the same functions: it supplies the formula text shown in the page, and the
 * self-tests check that both routes give the same numbers.
 */
public final class DocFormulas {
    private DocFormulas() {}

    /** One row of the table. {@code poly} holds the coefficients in ascending powers of sigma. */
    public record Entry(int n, int l, int k, int s, long d, long[] poly) {

        /** R_nl(sigma) without the factor (Z/a0)^(3/2). */
        public double value(double sigma) {
            double p = 0.0;
            for (int i = poly.length - 1; i >= 0; i--) p = p * sigma + poly[i];
            return k * Math.sqrt(s) / d * Math.pow(sigma, l) * p * Math.exp(-sigma / n);
        }

        /** Printable form, for example "R₃₁(σ) = (Z/a₀)^(3/2) · 2√6/243 · σ (6 − σ) e^(−σ/3)". */
        public String text() {
            StringBuilder sb = new StringBuilder();
            sb.append("R").append(sub(n)).append(sub(l)).append("(σ) = (Z/a₀)^(3/2) · ");
            String num = (k != 1 ? Integer.toString(k) : "") + (s != 1 ? "√" + s : "");
            if (num.isEmpty()) num = "1";
            sb.append(d != 1 ? num + "/" + d : num);
            if (l > 0) sb.append(" · σ").append(l > 1 ? sup(l) : "");
            if (!(poly.length == 1 && poly[0] == 1)) sb.append(" (").append(polyText()).append(")");
            sb.append(" e^(−σ/").append(n).append(")");
            if (n == 1) return sb.toString().replace("e^(−σ/1)", "e^(−σ)");
            return sb.toString();
        }

        private String polyText() {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < poly.length; i++) {
                long c = poly[i];
                if (c == 0) continue;
                String term = (Math.abs(c) == 1 && i > 0 ? "" : Long.toString(Math.abs(c)))
                        + (i == 0 ? "" : "σ" + (i > 1 ? sup(i) : ""));
                if (sb.length() == 0) sb.append(c < 0 ? "−" : "").append(term);
                else sb.append(c < 0 ? " − " : " + ").append(term);
            }
            return sb.toString();
        }
    }

    private static String sub(int v) {
        StringBuilder sb = new StringBuilder();
        for (char ch : Integer.toString(v).toCharArray()) sb.append((char) ('₀' + (ch - '0')));
        return sb.toString();
    }

    private static String sup(int v) {
        final String digits = "⁰¹²³⁴⁵⁶⁷⁸⁹";
        StringBuilder sb = new StringBuilder();
        for (char ch : Integer.toString(v).toCharArray()) sb.append(digits.charAt(ch - '0'));
        return sb.toString();
    }

    private static final List<Entry> TABLE = new ArrayList<>();

    private static void add(int n, int l, int k, int s, long d, long... poly) {
        TABLE.add(new Entry(n, l, k, s, d, poly));
    }

    static {
        add(1, 0, 2, 1, 1, 1);
        add(2, 0, 1, 2, 4, 2, -1);
        add(2, 1, 1, 6, 12, 1);
        add(3, 0, 2, 3, 243, 27, -18, 2);
        add(3, 1, 2, 6, 243, 6, -1);
        add(3, 2, 2, 30, 1215, 1);
        add(4, 0, 1, 1, 768, 192, -144, 24, -1);
        add(4, 1, 1, 15, 3840, 80, -20, 1);
        add(4, 2, 1, 5, 3840, 12, -1);
        add(4, 3, 1, 35, 26880, 1);
        add(5, 0, 2, 5, 234375, 9375, -7500, 1500, -100, 2);
        add(5, 1, 2, 30, 703125, 3750, -1125, 90, -2);
        add(5, 2, 2, 70, 1640625, 525, -70, 2);
        add(5, 3, 2, 70, 1640625, 20, -1);
        add(6, 0, 1, 6, 3149280, 174960, -145800, 32400, -2700, 90, -1);
        add(6, 1, 1, 210, 22044960, 68040, -22680, 2268, -84, 1);
        add(6, 2, 1, 105, 22044960, 9072, -1512, 72, -1);
        add(7, 0, 2, 7, 1815912315L, 37059435L, -31765230L, 7563150L, -720300L, 30870L, -588L, 4L);
        add(7, 1, 4, 21, 1815912315L, 3529470L, -1260525L, 144060L, -6860L, 140L, -1L);
        add(8, 0, 1, 2, 10569646080L, 660602880L, -578027520L, 144506880L, -15052800L, 752640L, -18816L, 224L, -1L);
    }

    public static List<Entry> all() {
        return TABLE;
    }

    public static Entry get(int n, int l) {
        for (Entry e : TABLE) if (e.n() == n && e.l() == l) return e;
        return null;
    }

    public static boolean has(int n, int l) {
        return get(n, l) != null;
    }
}
