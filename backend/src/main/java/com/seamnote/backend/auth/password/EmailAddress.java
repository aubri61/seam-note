package com.seamnote.backend.auth.password;
import java.util.Locale;
public final class EmailAddress {
    private EmailAddress() {}
    // Product policy: case-insensitive whole address; no provider-specific alias rewriting.
    public static String normalize(String email) { return email.strip().toLowerCase(Locale.ROOT); }
}
