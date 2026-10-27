package hydrogen;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The catalogue: the 20 subshells 1s to 8s of the reference document and their 60 orbitals. */
public final class Orbitals {
    private Orbitals() {}

    public record Subshell(int n, int l, String shell, List<Orbital> orbitals) {}

    private static final List<Subshell> SUBSHELLS;
    private static final List<Orbital> ALL;
    private static final Map<String, Orbital> BY_ID = new LinkedHashMap<>();

    static {
        List<Subshell> subs = new ArrayList<>();
        List<Orbital> all = new ArrayList<>();
        for (int n = 1; n <= 8; n++) {
            for (int l = 0; l <= 3; l++) {
                if (!DocFormulas.has(n, l)) continue;
                List<Orbital> orbs = new ArrayList<>();
                for (Angular a : Angular.forL(l)) orbs.add(new Orbital(n, l, a));
                Subshell s = new Subshell(n, l, orbs.get(0).shell(), Collections.unmodifiableList(orbs));
                subs.add(s);
                all.addAll(orbs);
            }
        }
        SUBSHELLS = Collections.unmodifiableList(subs);
        ALL = Collections.unmodifiableList(all);
        for (Orbital o : ALL) BY_ID.put(o.id(), o);
    }

    public static List<Subshell> subshells() {
        return SUBSHELLS;
    }

    public static List<Orbital> all() {
        return ALL;
    }

    /** Looks an orbital up by id; returns null if there is none. */
    public static Orbital byId(String id) {
        return id == null ? null : BY_ID.get(id);
    }
}
