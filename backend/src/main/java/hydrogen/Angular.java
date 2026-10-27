package hydrogen;

import java.util.ArrayList;
import java.util.List;

/**
 * The 16 real angular functions (s, p, d, f) used for chemistry orbitals. Each is normalized over the sphere.
 * They are evaluated from the Cartesian form on a unit vector (x, y, z), so there is no division by r.
 */
public enum Angular {
    S("", "", 0, "1/(2√π)"),

    PZ("z", "z", 1, "√(3/4π) z/r"),
    PX("x", "x", 1, "√(3/4π) x/r"),
    PY("y", "y", 1, "√(3/4π) y/r"),

    DZ2("z2", "z²", 2, "√(5/16π) (3z² − r²)/r²"),
    DXZ("xz", "xz", 2, "√(15/4π) xz/r²"),
    DYZ("yz", "yz", 2, "√(15/4π) yz/r²"),
    DXY("xy", "xy", 2, "√(15/4π) xy/r²"),
    DX2Y2("x2-y2", "x²−y²", 2, "√(15/16π) (x² − y²)/r²"),

    FZ3("z3", "z³", 3, "(1/4)√(7/π) (5z³ − 3zr²)/r³"),
    FXZ2("xz2", "xz²", 3, "(1/4)√(21/2π) x(5z² − r²)/r³"),
    FYZ2("yz2", "yz²", 3, "(1/4)√(21/2π) y(5z² − r²)/r³"),
    FZXY("z(x2-y2)", "z(x²−y²)", 3, "(1/4)√(105/π) z(x² − y²)/r³"),
    FXYZ("xyz", "xyz", 3, "(1/2)√(105/π) xyz/r³"),
    FX3("x(x2-3y2)", "x(x²−3y²)", 3, "(1/4)√(35/2π) x(x² − 3y²)/r³"),
    FY3("y(3x2-y2)", "y(3x²−y²)", 3, "(1/4)√(35/2π) y(3x² − y²)/r³");

    /** Suffix of the orbital id, for example "xz" in "3dxz". */
    public final String key;
    /** Subscript shown in the label, for example "x²−y²". */
    public final String sub;
    public final int l;
    /** Cartesian form as written in the reference document. */
    public final String formula;

    Angular(String key, String sub, int l, String formula) {
        this.key = key;
        this.sub = sub;
        this.l = l;
        this.formula = formula;
    }

    private static final double C0 = 0.5 / Math.sqrt(Math.PI);
    private static final double C1 = Math.sqrt(3.0 / (4.0 * Math.PI));
    private static final double C2A = Math.sqrt(5.0 / (16.0 * Math.PI));
    private static final double C2B = Math.sqrt(15.0 / (4.0 * Math.PI));
    private static final double C2C = Math.sqrt(15.0 / (16.0 * Math.PI));
    private static final double C3A = 0.25 * Math.sqrt(7.0 / Math.PI);
    private static final double C3B = 0.25 * Math.sqrt(21.0 / (2.0 * Math.PI));
    private static final double C3C = 0.25 * Math.sqrt(105.0 / Math.PI);
    private static final double C3D = 0.5 * Math.sqrt(105.0 / Math.PI);
    private static final double C3E = 0.25 * Math.sqrt(35.0 / (2.0 * Math.PI));

    /** Value at the direction (x, y, z), which must be a unit vector. */
    public double eval(double x, double y, double z) {
        switch (this) {
            case S: return C0;
            case PZ: return C1 * z;
            case PX: return C1 * x;
            case PY: return C1 * y;
            case DZ2: return C2A * (3 * z * z - 1);
            case DXZ: return C2B * x * z;
            case DYZ: return C2B * y * z;
            case DXY: return C2B * x * y;
            case DX2Y2: return C2C * (x * x - y * y);
            case FZ3: return C3A * (5 * z * z * z - 3 * z);
            case FXZ2: return C3B * x * (5 * z * z - 1);
            case FYZ2: return C3B * y * (5 * z * z - 1);
            case FZXY: return C3C * z * (x * x - y * y);
            case FXYZ: return C3D * x * y * z;
            case FX3: return C3E * x * (x * x - 3 * y * y);
            case FY3: return C3E * y * (3 * x * x - y * y);
            default: throw new IllegalStateException();
        }
    }

    /** The angular functions for one value of l, in the order of the reference document. */
    public static List<Angular> forL(int l) {
        List<Angular> out = new ArrayList<>();
        for (Angular a : values()) if (a.l == l) out.add(a);
        return out;
    }

    private volatile double maxSq = -1.0;

    /** Largest value of the square of the function on the sphere (found on a fine Fibonacci grid). */
    public double maxSquare() {
        double m = maxSq;
        if (m < 0) {
            int count = 400000;
            double golden = Math.PI * (3.0 - Math.sqrt(5.0)), best = 0.0;
            for (int i = 0; i < count; i++) {
                double z = 1.0 - 2.0 * (i + 0.5) / count, rho = Math.sqrt(1.0 - z * z), phi = golden * i;
                double v = eval(rho * Math.cos(phi), rho * Math.sin(phi), z);
                best = Math.max(best, v * v);
            }
            m = best;
            maxSq = m;
        }
        return m;
    }
}
