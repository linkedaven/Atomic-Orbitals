package hydrogen;

/** One real orbital: a shell n, an angular momentum l and one of the 2l + 1 real angular functions. */
public record Orbital(int n, int l, Angular angular) {

    public String shell() {
        return n + "spdf".substring(l, l + 1);
    }

    /** Unique id used in URLs, for example "1s", "2pz", "3dx2-y2", "4fz(x2-y2)". */
    public String id() {
        return shell() + angular.key;
    }

    /** Plain label with the orientation after the shell, for example "3dxz". */
    public String label() {
        return shell() + angular.sub;
    }

    public int radialNodes() {
        return n - l - 1;
    }
}
