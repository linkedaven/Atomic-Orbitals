package hydrogen;

/** psi(sigma vector) = R_nl(sigma) * Y(direction), in units where the factor (Z/a0)^(3/2) is left out. */
public final class Wavefunction {
    private Wavefunction() {}

    /** The (real) wave function at the point (x, y, z) given in sigma units. */
    public static double psi(Orbital o, double x, double y, double z) {
        double r = Math.sqrt(x * x + y * y + z * z);
        double radial = Radial.value(o.n(), o.l(), r);
        if (r < 1e-12) return o.l() == 0 ? radial * o.angular().eval(0, 0, 1) : 0.0;
        return radial * o.angular().eval(x / r, y / r, z / r);
    }
}
