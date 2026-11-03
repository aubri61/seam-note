package com.seamnote.backend.auth.config;
import com.seamnote.backend.auth.password.*;
import com.seamnote.backend.auth.web.*;
import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.*;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.context.NullSecurityContextRepository;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import java.util.List;
import java.util.Set;

@Configuration
public class SecurityConfig {
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(10); }
    @Bean AuthenticationManager authenticationManager(SeamUserDetailsService users, PasswordEncoder encoder) {
        var provider = new DaoAuthenticationProvider(users);
        provider.setPasswordEncoder(encoder);
        return new ProviderManager(provider);
    }
    private void errors(HttpSecurity http, SecurityResponses responses) throws Exception {
        http.exceptionHandling(errors -> errors
            .authenticationEntryPoint((req, res, ex) -> responses.error(res, 401, "AUTHENTICATION_REQUIRED", "인증이 필요합니다."))
            .accessDeniedHandler((req, res, ex) -> responses.error(res, 403, "ACCESS_DENIED", "요청 권한을 확인해주세요.")));
    }
    @Bean @Order(1)
    SecurityFilterChain auth(HttpSecurity http, AuthRateLimiter limiter, SecurityResponses responses) throws Exception {
        http.securityMatcher("/api/auth/**")
            .authorizeHttpRequests(rules -> rules
                .requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/signup", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/auth/me").hasRole("USER")
                .anyRequest().denyAll())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .securityContext(context -> context.securityContextRepository(new NullSecurityContextRepository()))
            .addFilterBefore(new AuthRequestFilter(limiter, responses), CsrfFilter.class);
        var bearer = new DefaultBearerTokenResolver();
        http.oauth2ResourceServer(resource -> resource
            .bearerTokenResolver(request -> Set.of("/api/auth/csrf", "/api/auth/signup", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout")
                .contains(request.getServletPath()) ? null : bearer.resolve(request))
            .jwt(jwt -> jwt.jwtAuthenticationConverter(token -> new JwtAuthenticationToken(token,
                List.of(new SimpleGrantedAuthority("ROLE_USER")), token.getSubject())))
            .authenticationEntryPoint((req, res, ex) -> responses.error(res, 401, "AUTHENTICATION_REQUIRED", "인증이 필요합니다."))
            .accessDeniedHandler((req, res, ex) -> responses.error(res, 403, "ACCESS_DENIED", "요청 권한을 확인해주세요.")));
        http.csrf(csrf -> csrf.requireCsrfProtectionMatcher(request ->
            !Set.of("GET", "HEAD", "OPTIONS", "TRACE").contains(request.getMethod())));
        // CSRF session is not an authenticated login session.
        errors(http, responses);
        return http.build();
    }
    @Bean @Order(2)
    SecurityFilterChain existingSharedValidationApi(HttpSecurity http, SecurityResponses responses) throws Exception {
        // Transitional existing contract only. No per-user authorization until Phase 4.
        http.authorizeHttpRequests(rules -> rules
                .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                .requestMatchers("/api/notes", "/api/notes/**", "/api/folders", "/api/folders/**",
                    "/api/workspace/tree", "/api/hello", "/actuator/health", "/actuator/health/**").permitAll()
                .anyRequest().denyAll())
            .csrf(csrf -> csrf.ignoringRequestMatchers("/api/notes", "/api/notes/**", "/api/folders", "/api/folders/**"))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
        errors(http, responses);
        return http.build();
    }
}
