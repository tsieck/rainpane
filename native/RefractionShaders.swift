import Foundation

let refractionMetalSource = #"""
#include <metal_stdlib>
using namespace metal;

struct DropletInstance {
    float2 center;
    float2 radii;
    float4 optical;
    float4 appearance;
};

struct ProtectedRegion {
    float4 rect;
    float4 parameters;
};

struct FrameUniforms {
    float2 viewport;
    float2 captureSize;
    uint dropletCount;
    uint protectedCount;
    float elapsedTime;
    float padding;
};

struct VertexOut {
    float4 position [[position]];
    float2 local;
    float2 screenUV;
    float2 radii;
    float4 optical;
    float4 appearance;
};

vertex VertexOut dropletVertex(
    uint vertexID [[vertex_id]],
    uint instanceID [[instance_id]],
    constant FrameUniforms &uniforms [[buffer(0)]],
    const device DropletInstance *droplets [[buffer(1)]])
{
    constexpr float2 corners[6] = {
        float2(-1.0, -1.0), float2( 1.0, -1.0), float2(-1.0,  1.0),
        float2(-1.0,  1.0), float2( 1.0, -1.0), float2( 1.0,  1.0)
    };

    DropletInstance droplet = droplets[instanceID];
    // Leave analytic padding around the cap so edge derivatives are never
    // clipped by the instance quad, including on 1–3 px Retina beads.
    float2 corner = corners[vertexID] * 1.28;
    float2 logicalPosition = droplet.center + corner * droplet.radii;
    float2 normalizedPosition = logicalPosition / max(uniforms.viewport, float2(1.0));

    VertexOut output;
    output.position = float4(
        normalizedPosition.x * 2.0 - 1.0,
        1.0 - normalizedPosition.y * 2.0,
        0.0,
        1.0
    );
    output.local = corner;
    output.screenUV = normalizedPosition;
    output.radii = droplet.radii;
    output.optical = droplet.optical;
    output.appearance = droplet.appearance;
    return output;
}

float roundedRectDistance(float2 point, constant ProtectedRegion &region) {
    float2 origin = region.rect.xy;
    float2 size = region.rect.zw;
    float radius = clamp(region.parameters.x, 0.0, min(size.x, size.y) * 0.5);
    float2 halfSize = size * 0.5;
    float2 q = abs(point - (origin + halfSize)) - (halfSize - radius);
    return length(max(q, float2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

bool isProtected(
    float2 logicalPoint,
    constant ProtectedRegion *regions,
    uint regionCount,
    float padding)
{
    for (uint index = 0; index < regionCount; ++index) {
        if (roundedRectDistance(logicalPoint, regions[index]) <= padding) {
            return true;
        }
    }
    return false;
}

float3 sceneColorLinear(
    texture2d<float> scene,
    sampler sceneSampler,
    float2 uv)
{
    float3 color = scene.sample(sceneSampler, clamp(uv, float2(0.0), float2(1.0))).rgb;
    constexpr float3 cutoff = float3(0.04045);
    return select(color / 12.92, pow((color + 0.055) / 1.055, float3(2.4)), color > cutoff);
}

float3 protectedSafeSceneColor(
    texture2d<float> scene,
    sampler sceneSampler,
    float2 uv,
    float3 fallback,
    float2 viewport,
    constant ProtectedRegion *regions,
    uint regionCount,
    float protectionPadding)
{
    // Test the clamped coordinate because the sampler also clamps. Otherwise
    // an off-screen tap could resolve onto an edge pixel inside the protected
    // window even though its original logical coordinate was outside it.
    float2 sampleUV = clamp(uv, float2(0.0), float2(1.0));
    if (isProtected(sampleUV * viewport, regions, regionCount, protectionPadding)) {
        return fallback;
    }
    return sceneColorLinear(scene, sceneSampler, sampleUV);
}

float3 fiveTapSceneColor(
    texture2d<float> scene,
    sampler sceneSampler,
    float2 uv,
    float2 normalXY,
    float blurPixels,
    float2 captureSize,
    float2 viewport,
    constant ProtectedRegion *regions,
    uint regionCount,
    float protectionPadding)
{
    float2 pixel = 1.0 / max(captureSize, float2(1.0));
    float2 tangent = normalize(float2(-normalXY.y, normalXY.x) + float2(0.0001, 0.0));
    float2 bitangent = float2(-tangent.y, tangent.x);
    float2 tangentOffset = tangent * blurPixels * pixel;
    float2 bitangentOffset = bitangent * blurPixels * 0.72 * pixel;
    float2 dispersion = normalXY * 0.52 * pixel;

    // SCStream is configured for sRGB. The CVMetalTexture is intentionally an
    // unorm view for broad IOSurface compatibility, so decode before optical
    // filtering. The sRGB CAMetalLayer encodes the linear result on write.
    float3 center = sceneColorLinear(scene, sceneSampler, uv);
    // If a blur or dispersion tap reaches the protected window, reuse the
    // already-safe center sample. No protected pixel is sampled or averaged.
    float3 tapA = protectedSafeSceneColor(
        scene, sceneSampler, uv + tangentOffset + dispersion, center,
        viewport, regions, regionCount, protectionPadding
    );
    float3 tapB = protectedSafeSceneColor(
        scene, sceneSampler, uv - tangentOffset + dispersion, center,
        viewport, regions, regionCount, protectionPadding
    );
    float3 tapC = protectedSafeSceneColor(
        scene, sceneSampler, uv + bitangentOffset - dispersion, center,
        viewport, regions, regionCount, protectionPadding
    );
    float3 tapD = protectedSafeSceneColor(
        scene, sceneSampler, uv - bitangentOffset - dispersion, center,
        viewport, regions, regionCount, protectionPadding
    );

    float3 filtered = center * 0.52 + (tapA + tapB + tapC + tapD) * 0.12;
    // Water's wavelength-dependent IOR is subtle: only borrow a restrained
    // amount of red and blue from the opposing dispersion taps.
    filtered.r = mix(filtered.r, (tapA.r + tapB.r) * 0.5, 0.18);
    filtered.b = mix(filtered.b, (tapC.b + tapD.b) * 0.5, 0.18);
    return filtered;
}

fragment float4 dropletFragment(
    VertexOut input [[stage_in]],
    texture2d<float> scene [[texture(0)]],
    sampler sceneSampler [[sampler(0)]],
    constant FrameUniforms &uniforms [[buffer(0)]],
    constant ProtectedRegion *protectedRegions [[buffer(1)]])
{
    float2 p = input.local;
    float angle = atan2(p.y, p.x);
    float seed = input.optical.w * 6.2831853;
    float shapeAmount = input.appearance.y;
    float boundary = 1.0
        + sin(angle * 3.0 + seed) * 0.065 * shapeAmount
        + sin(angle * 5.0 - seed * 1.7) * 0.025 * shapeAmount;

    // A tiny center-of-mass asymmetry keeps beads organic without turning a
    // running bead into a bulb with a filament-like tail.
    p.x += sin(seed * 2.1) * 0.028 * p.y * p.y * shapeAmount;
    p.x /= 1.0 + p.y * 0.055 * shapeAmount;
    p.y += cos(seed * 1.3) * 0.018 * p.x * p.x * shapeAmount;
    float radial = length(p) / boundary;
    float edgeWidth = clamp(fwidth(radial) * 0.65, 0.002, 0.42);
    float edgeCoverage = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, radial);
    if (edgeCoverage <= 0.001) {
        discard_fragment();
    }

    float2 logicalPoint = input.screenUV * uniforms.viewport;
    if (isProtected(logicalPoint, protectedRegions, uniforms.protectedCount, 0.0)) {
        discard_fragment();
    }

    // Spherical-cap surface normal, then Snell refraction from air into water.
    float2 capXY = p / boundary;
    float capZ = sqrt(max(1.0 - dot(capXY, capXY), 0.001));
    float3 normal = normalize(float3(capXY * 0.76, capZ));
    constexpr float airToWaterIOR = 1.000293 / 1.333;
    float3 ray = refract(float3(0.0, 0.0, -1.0), normal, airToWaterIOR);
    float2 raySlope = ray.xy / max(-ray.z, 0.28);

    float minimumRadius = min(input.radii.x, input.radii.y);
    float refractionPixels = clamp(minimumRadius * 0.72 * input.optical.y, 0.0, 18.0);
    float2 refractedUV = input.screenUV + raySlope * refractionPixels / max(uniforms.viewport, float2(1.0));
    float2 logicalPerCapturePixel = uniforms.viewport / max(uniforms.captureSize, float2(1.0));
    float sampleProtectionPadding = max(0.5, max(logicalPerCapturePixel.x, logicalPerCapturePixel.y) * 0.75);
    float2 sampledRefractedUV = clamp(refractedUV, float2(0.0), float2(1.0));
    float2 refractedLogicalPoint = sampledRefractedUV * uniforms.viewport;
    if (isProtected(
        refractedLogicalPoint,
        protectedRegions,
        uniforms.protectedCount,
        sampleProtectionPadding
    )) {
        discard_fragment();
    }

    float blurPixels = clamp(0.32 + minimumRadius * 0.038 * input.optical.z, 0.32, 2.35);
    float3 refractedColor = fiveTapSceneColor(
        scene,
        sceneSampler,
        sampledRefractedUV,
        normal.xy,
        blurPixels,
        uniforms.captureSize,
        uniforms.viewport,
        protectedRegions,
        uniforms.protectedCount,
        sampleProtectionPadding
    );

    // Schlick Fresnel, deliberately capped so the desktop remains legible.
    float fresnel = 0.020 + 0.980 * pow(1.0 - clamp(normal.z, 0.0, 1.0), 5.0);
    float2 reflectedUV = input.screenUV + float2(normal.x * 0.004, -abs(normal.y) * 0.012);
    float3 reflectedColor = protectedSafeSceneColor(
        scene,
        sceneSampler,
        reflectedUV,
        refractedColor,
        uniforms.viewport,
        protectedRegions,
        uniforms.protectedCount,
        sampleProtectionPadding
    );
    float coolReflection = 0.5 + 0.5 * fresnel;
    reflectedColor = mix(reflectedColor, float3(0.86, 0.93, 1.0), 0.055 * coolReflection);
    float3 color = mix(refractedColor, reflectedColor, min(fresnel * 0.24, 0.18));

    float3 lightDirection = normalize(float3(-0.58, -0.66, 0.48));
    float specular = pow(max(dot(normal, lightDirection), 0.0), 72.0);
    float shoulder = pow(max(dot(normal, normalize(float3(0.52, 0.38, 0.76))), 0.0), 18.0);
    color += float3(1.0, 0.985, 0.95) * specular * 0.24 * input.appearance.x;
    color += float3(0.72, 0.84, 0.94) * shoulder * 0.055 * input.appearance.x;

    // Broad window illumination forms an inverted lower crescent. The dark
    // upper shoulder and an irregular contact line keep the lens readable
    // over both bright documents and a dark desktop without a solid fill.
    float upperShoulder = smoothstep(0.38, 0.78, radial)
        * (1.0 - smoothstep(0.93, 1.0, radial))
        * smoothstep(-0.04, 0.55, -p.y);
    float lowerCrescent = exp(-pow((radial - 0.77) / 0.13, 2.0))
        * smoothstep(0.12, 0.65, p.y) * (0.84 + sin(seed) * 0.12);
    color *= 1.0 - upperShoulder * 0.42;
    color += float3(0.72, 0.82, 0.84) * lowerCrescent * 0.38 * input.appearance.x;

    float opticalDepth = smoothstep(0.02, 0.34, capZ);
    float alpha = input.optical.x * edgeCoverage * mix(0.80, 1.0, opticalDepth);
    return float4(color, alpha);
}
"""#
