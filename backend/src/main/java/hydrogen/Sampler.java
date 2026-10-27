package hydrogen;

import java.util.SplittableRandom;

/**
 * Draws random points whose density is |psi|^2, the usual "electron cloud" picture.
 *
 * <p>The orbital factorizes, so no 3D rejection is needed: the radius is drawn from the radial probability
 * by inverting its cumulative distribution, and the direction is drawn from |Y|^2 on the sphere by rejection.
 * The radius is limited to the sphere that holds 99.9 % of the probability.
 */
public final class Sampler {
    private Sampler() {}

    /** Safety factor on the largest |Y|^2 used by the rejection step (the grid maximum is within about 1e-5 of the true one). */
    static final double MARGIN = 1.02;

    /** Points in sigma units, interleaved as x, y, z, and the sign of psi at each point (+1 or -1). */
    public record Cloud(float[] xyz, byte[] sign) {
        public int count() {
            return sign.length;
        }
    }

    public static Cloud sample(Orbital o, int count, long seed) {
        Radial.Info info = Radial.info(o.n(), o.l());
        Angular ang = o.angular();
        double ymax = ang.maxSquare() * MARGIN;
        SplittableRandom rng = new SplittableRandom(seed);
        float[] xyz = new float[3 * count];
        byte[] sign = new byte[count];
        for (int i = 0; i < count; i++) {
            double sigma = info.quantile(rng.nextDouble() * 0.999);
            double x, y, z, y2, ux, uy, uz;
            double value;
            do {
                x = gaussian(rng);
                y = gaussian(rng);
                z = gaussian(rng);
                double norm = Math.sqrt(x * x + y * y + z * z);
                if (norm < 1e-12) continue;
                ux = x / norm;
                uy = y / norm;
                uz = z / norm;
                value = ang.eval(ux, uy, uz);
                y2 = value * value;
                if (rng.nextDouble() * ymax <= y2) {
                    xyz[3 * i] = (float) (sigma * ux);
                    xyz[3 * i + 1] = (float) (sigma * uy);
                    xyz[3 * i + 2] = (float) (sigma * uz);
                    boolean negative = (Radial.value(o.n(), o.l(), sigma) < 0) != (value < 0);
                    sign[i] = (byte) (negative ? -1 : 1);
                    break;
                }
            } while (true);
        }
        return new Cloud(xyz, sign);
    }

    private static double gaussian(SplittableRandom rng) {
        double u1 = 1.0 - rng.nextDouble(), u2 = rng.nextDouble();
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    }
}
