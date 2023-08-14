
// Vertex shader program
export const drawingVertexShader = `
    attribute vec4 aVertexPosition;
    uniform vec2 uPosition;    // The brush center position in GL coordinates
    uniform float uSize;       // Half the size of the brush quad
    uniform float uAngle;
    uniform vec2 uResolution;

    varying vec2 vUV;
    varying float vSize;

    void main(void) {
        vec2 size = vec2(uSize) / uResolution*vec2(1.,1.);

        // rotation
        float s = sin(uAngle);
        float c = cos(uAngle);
        mat2 rot = mat2(c, -s, s, c);
        vec4 rotatedPos = vec4(rot * aVertexPosition.xy, 1.0, 1.0);

        gl_Position = aVertexPosition * vec4(size.xy, 1.0, 1.0) + vec4(uPosition, 0.0, 0.0);
        vUV = aVertexPosition.xy * 0.5 * vec2(1.,1.) + 0.5;
        vSize = uSize;

    }
`;


export const drawingFragmentShader = `
    precision mediump float;

    uniform vec4 uBrushColor;
    uniform vec4 uSecondColor;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uBrushJitter;
    uniform float uDissipation;
    uniform float uIsBump;
    
    varying vec2 vUV;
    varying float vSize;

    
    #define NUM_OCTAVES 2

    
    float lum(float r, float g, float b) {
        return sqrt(0.299*r*r + 0.587*g*g + 0.114*b*b);
        // return sqrt(0.2126*r + 0.7152*g + 0.0722*b);
    }


    float hue2rgb(float p, float q, float t) {
        if (t < 0.0) t += 1.0;
        if (t > 1.0) t -= 1.0;
        if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
        if (t < 0.5) return q;
        if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
        return p;
    }

    vec3 hsl2rgb(float h, float s, float l) {

        float r, g, b;
        if (s == 0.0) {
            r = g = b = l; // achromatic
        } else {
            float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
            float p = 2.0 * l - q;
            r = hue2rgb(p, q, h + 1.0 / 3.0);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1.0 / 3.0);
        }

        return vec3(r, g, b);
    }

    vec3 hsx2rgb(float hue, float sat, float targetLuminance) {
        
        const float epsilon = 0.001;
        float low = 0.0;
        float high = 1.0;
        float mid;

        for(int i = 0; i < 16; i++) { // Limiting the number of iterations for performance
            mid = (low + high) * 0.5;
            vec3 rgb = hsl2rgb(hue, sat, mid);
            float currentLum = lum(rgb.r, rgb.g, rgb.b);

            if (currentLum < targetLuminance) {
                low = mid;
            } else {
                high = mid;
            }

            if (high - low < epsilon) {
                break; 
            }
        }

        return hsl2rgb(hue, sat, mid);
    }

    float hash12(vec2 p)
    {
        vec3 p3  = fract(vec3(p.xyx) * .1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }


    float noise3 (vec2 _st,float t) {
        vec2 i = floor(_st+t);
        vec2 f = fract(_st+t);

        // Four corners2D of a tile
        float a = hash12(i);
        float b = hash12(i + vec2(1.0, 0.0));
        float c = hash12(i + vec2(0.0, 1.0));
        float d = hash12(i + vec2(1.0, 1.0));

        vec2 u = f * f * (3.0 - 2.0 * f);

        return mix(a, b, u.x) +
                (c - a)* u.y * (1.0 - u.x) +
                (d - b) * u.x * u.y;
    }

    float power(float p, float g) {
        if (p < 0.5)
            return 0.5 * pow(2.*p, g);
        else
            return 1. - 0.5 * pow(2.*(1. - p), g);
    }
    float fbm3 (vec2 _st, float t) {
        float v = 0.0;
        float a = 0.5;
        vec2 shift = vec2(100.0);
        // Rotate to reduce axial bias
        mat2 rot = mat2(cos(0.5), sin(0.5),
                        -sin(0.5), cos(0.50));
        for (int i = 0; i < NUM_OCTAVES; ++i) {
            v += a * noise3(_st, t);
            _st = rot * _st * 2.0 + shift;
            a *= 0.5;
        }
        return v;
    }

    vec4 Saturate(vec4 inc, float sat) {
        if (abs(sat)<0.004) {return inc;}  //Immediately return when sat is zero or so small no difference will result (less than 1/255)
        if ((inc.r==0.0)&&(inc.g==0.0)&&(inc.b==0.0)) {return inc;}  //Prevents division by zero trying to saturate black
    
        vec4 outc;
        vec3 clerp=vec3(inc.r,inc.g,inc.b);
    
        if (sat>0.0) {
            vec3 maxsat;
            float mx=max(max(inc.r,inc.g),inc.b);
            maxsat=clerp*1.0/mx;
            clerp=mix(clerp,maxsat,sat);
        }
        if (sat<0.0) {
            vec3 grayc;
            float avg=(inc.r+inc.g+inc.b)/3.;
            grayc=vec3(avg);
            clerp=mix(clerp,grayc,-1.0*sat);
        }
        outc=vec4(clerp.xyz, 1.);
        return outc;
        return vec4(1.);
    }

    
    vec4 Xform_RYB2RGB(float r, float y, float b) {
        float rin=r;
        float yin=y;
        float bin=b;


        //The values defined here are where the magic happens.  You can experiment with changing the values and see if you find a better set.  If so, notify me on GitHub @ProfJski !
        //I have included a few alternative sets below

        //RYB corners in RGB values
        //Values arranged to approximate an artist's color wheel
        vec3 CG000=vec3(0.0,0.0,0.0); //Black
        vec3 CG100=vec3(1.0,0.0,0.0); //Red
        vec3 CG010=vec3(0.9,0.9,0.0); //Yellow = RGB Red+Green.  Still a bit high, but helps Yellow compete against Green.  Lower gives murky yellows.
        vec3 CG001=vec3(0.0,0.36,1.0); //Blue: Green boost of 0.36 helps eliminate flatness of spectrum around pure Blue
        vec3 CG011=vec3(0.0,0.9,0.2); //Green: A less intense green than {0,1,0}, which tends to dominate
        vec3 CG110=vec3(1.0,0.6,0.0); //Orange = RGB full Red, 60% Green
        vec3 CG101=vec3(0.6,0.0,1.0); //Purple = 60% Red, full Blue
        vec3 CG111=vec3(1.0,1.0,1.0); //White

        //Trilinear interpolation from RYB to RGB
        vec3 C00,C01,C10,C11;
        C00=CG000*(1.0-rin) + CG100*rin;
        C01=CG001*(1.0-rin) + CG101*rin;
        C10=CG010*(1.0-rin) + CG110*rin;
        C11=CG011*(1.0-rin) + CG111*rin;

        vec3 C0,C1;
        C0=C00*(1.0-yin) + C10*yin;
        C1=C01*(1.0-yin) + C11*yin;

        vec3 C;
        C=C0*(1.0-bin) + C1*bin;

        vec4 CRGB=vec4(C.x,C.y,C.z,1.);
        CRGB=vec4(r,y,b,1.);

        return CRGB;
    }

    vec4 Xform_RGB2RYB(float r, float g, float b) {
        float rin=r;
        float gin=g;
        float bin=b;
    
        //Finding the appropriate values for the inverse transform was no easy task.  After some experimentation, I wrote a separate program that used
        //the calculus of variations to help tweak my guesses towards values that provided a closer round-trip conversion from RGB to RYB to RGB again.
    
        //RGB corners in RYB values
        vec3 CG000=vec3(0.0,0.0,0.0); //Black
        vec3 CG100=vec3(0.891,0.0,0.0); //Red
        vec3 CG010=vec3(0.0,0.714,0.374); //Green = RYB Yellow + Blue
        vec3 CG001=vec3(0.07,0.08,0.893); //Blue:
        vec3 CG011=vec3(0.0,0.116,0.313); //Cyan = RYB Green + Blue.  Very dark to make the rest of the function work correctly
        vec3 CG110=vec3(0.0,0.915,0.0); //Yellow
        vec3 CG101=vec3(0.554,0.0,0.1); //Magenta =RYB Red + Blue.  Likewise dark.
        vec3 CG111=vec3(1.0,1.0,1.0); //White
    
        //Trilinear interpolation from RGB to RYB
        vec3 C00,C01,C10,C11;
        C00=CG000*(1.0-rin) + CG100*rin;
        C01=CG001*(1.0-rin) + CG101*rin;
        C10=CG010*(1.0-rin) + CG110*rin;
        C11=CG011*(1.0-rin) + CG111*rin;
    
        vec3 C0,C1;
        C0=C00*(1.0-gin) + C10*gin;
        C1=C01*(1.0-gin) + C11*gin;
    
        vec3 C;
        C=C0*(1.0-bin) + C1*bin;
    
        vec4 CRYB=Saturate(vec4(C, 1.),0.5);
    
        return CRYB;
    }
    
    
    vec4 ColorMix(vec4 a, vec4 b, float blend) {
        vec4 outc;
        outc.r=sqrt((1.0-blend)*(a.r*a.r)+blend*(b.r*b.r));
        outc.g=sqrt((1.0-blend)*(a.g*a.g)+blend*(b.g*b.g));
        outc.b=sqrt((1.0-blend)*(a.b*a.b)+blend*(b.b*b.b));
        outc.a=(1.0-blend)*a.a+blend*b.a;
    
        return outc;
    }
    
    vec4 ColorMixLin(vec4 a, vec4 b, float blend) {
        vec4 outc;
        outc.r=(1.0-blend)*a.r+blend*b.r;
        outc.g=(1.0-blend)*a.g+blend*b.g;
        outc.b=(1.0-blend)*a.b+blend*b.b;
        outc.a=(1.0-blend)*a.a+blend*b.a;
    
        return outc;
    }

    
    vec4 ColorInv(vec4 inc) {
        return vec4(1.-inc.rgb, inc.a);
    }

    vec4 Brighten(vec4 inc, float bright) {
        if (bright==0.0) { return inc;}

        vec4 outc;
        if (bright>0.0) {
            outc=ColorMix(inc,vec4(1.,1.,1.,1.),bright);
        }

        if (bright<0.0) {
            outc=ColorMix(inc,vec4(0.,0.,0.,1.),-1.0*bright);
        }
        return outc;
    }


    float ColorDistance(vec4 a, vec4 b) {
        float outc=((a.r-b.r)*(a.r-b.r)+(a.g-b.g)*(a.g-b.g)+(a.b-b.b)*(a.b-b.b));
        outc=sqrt(outc)/(sqrt(3.0)*1.); //scale to 0-1
        return outc;
    }

    vec4 ColorMixSub(vec4 a, vec4 b, float blend) {
        vec4 outc;
        vec4 c,d,f;

        c=ColorInv(a);
        d=ColorInv(b);

        f.r=max(0.,1.-c.r-d.r);
        f.g=max(0.,1.-c.g-d.g);
        f.b=max(0.,1.-c.b-d.b);

        float cd=ColorDistance(a,b);
        cd=4.0*blend*(1.0-blend)*cd;
        outc=ColorMixLin(ColorMixLin(a,b,blend),f,cd);

        outc.a=1.;
        return outc;
    }

    
    float step2(float ang) {
        float outValue = 0.0;
        float sc = 0.0;
    
        float deg = ang * 360.0;

        deg = mod(deg+360.0*4., 360.0);
    
        if (deg <= 60.0) {
            outValue = 1.0;
        } else if (deg > 60.0 && deg <= 120.0) {
            sc = (deg - 60.0) / 60.0;
            outValue = 1.0 - 2.0 * sc / sqrt(1.0 + 3.0 * sc * sc);
        } else if (deg > 120.0 && deg <= 240.0) {
            outValue = 0.0;
        } else if (deg > 240.0 && deg <= 300.0) {
            sc = (deg - 240.0) / 60.0;
            outValue = 2.0 * sc / sqrt(1.0 + 3.0 * sc * sc);
        } else if (deg > 300.0 && deg <= 360.0) {
            outValue = 1.0;
        }
    
        return outValue;
    }
    
    vec4 map2(float ang) {
        float r = step2(ang);
        float y = step2(ang - 120. / 360.);
        float b = step2(ang - 240. / 360.);
        return Xform_RYB2RGB(r, y, b);
    }

    vec3 rgb2hsl(float r, float g, float b){
        float maxx = max(r, max(g, b));
        float minn = min(r, min(g, b));
        float h, s, l = (maxx + minn) / 2.;
    
        if(maxx == minn){
            h = s = 0.; // achromatic
        }else{
            float d = maxx - minn;
            s = l > 0.5 ? d / (2. - maxx - minn) : d / (maxx + minn);
            if(maxx == r)
                h = (g - b) / d + (g < b ? 6. : 0.);
            if(maxx == g)
                h = (b - r) / d + 2.;
            if(maxx == b)
                h = (r - g) / d + 4.;
            h /= 6.;
        }
    
        return vec3(h, s, l);
    }

    vec3 mymix(vec3 fffff, vec3 qqqqq, float t, float llm) {

        vec3 fffffhsl = rgb2hsl(fffff.r, fffff.g, fffff.b);
        vec3 qqqqqhsl = rgb2hsl(qqqqq.r, qqqqq.g, qqqqq.b);

        if(fffffhsl.x - qqqqqhsl.x > 0.5)
            qqqqqhsl.x += 1.0;
        else if(qqqqqhsl.x - fffffhsl.x > 0.5)
            fffffhsl.x += 1.0;

        float mixedhue = fract(mix(fffffhsl.x, qqqqqhsl.x, t));
        float mixedsat = mix(fffffhsl.y, qqqqqhsl.y, t);
        float mixedlum = mix(fffffhsl.z, qqqqqhsl.z, t);

        // return hsx2rgb(mixedhue, mixedsat, (lum(fffff.r,fffff.g,fffff.b)+lum(qqqqq.r,qqqqq.g,qqqqq.b))*0.5);
        return hsx2rgb(mixedhue, mixedsat, llm);
    }

    void main(void) {
        float dist = distance(vUV.xy, vec2(0.5, 0.5));
        float alpha = 1.0 - smoothstep(0.38, 0.5, dist);
        alpha = 1.;
        dist = smoothstep(0.0, 0.5, dist);

        float frq = vSize/3.;
        
        frq *= .6;
        if(uIsBump > .5){
            frq *= .6;
        }
        float ff = fbm3(vUV.xy*frq*vec2(1., 1.), uTime*.001);
        alpha *= smoothstep(0.35, 0.35+.2, ff);

        float rr = uBrushJitter*0.4*(-1.+2.*fbm3(vUV.xy*17.+31.31, uTime*.01*0.+213.13));

        vec3 brushRgb = hsx2rgb(fract(uBrushColor.r+1.0+rr), uBrushColor.g, uBrushColor.b);

        float mixamount = smoothstep(.3, .7, fbm3(vUV.xy*10.+131.31, uTime*.01*0.+11.44));
        if(uSecondColor.a > 0.0){
            // brushRgb = mix(brushRgb, uSecondColor.rgb, mixamount*uDissipation);
            brushRgb = mymix(brushRgb, uSecondColor.rgb, mixamount*uDissipation, uBrushColor.b);
        }

        float ff2 = fbm3(vUV.xy*frq*vec2(1., 1.)+314.4113, uTime*.001);
        // alpha = smoothstep(0.5, 0.5+.2, ff2);
        ff2 = pow(smoothstep(0.5, 0.5+.2, ff2), 2.);

        float gradx_fbm = fbm3(vUV.xy*frq*vec2(1., 1.)+314.4113 + vec2(0.04, 0.), uTime*.001) - fbm3(vUV.xy*frq*vec2(1., 1.)+314.4113 - vec2(0.04, 0.), uTime*.001);
        float grady_fbm = fbm3(vUV.xy*frq*vec2(1., 1.)+314.4113 + vec2(0., 0.04), uTime*.001) - fbm3(vUV.xy*frq*vec2(1., 1.)+314.4113 - vec2(0., 0.04), uTime*.001);

        vec2 grad_fbm = vec2(gradx_fbm, grady_fbm);
        grad_fbm = normalize(grad_fbm);

        vec2 lightdir = vec2(0.5, 0.5);
        lightdir = normalize(lightdir);

        vec2 xxyy = vUV.xy;
        frq = vSize/8.;
        xxyy.x += 1.3*(-1. + 2.*fbm3(xxyy*frq*vec2(1., 1.)+314.4113, 9.*uTime*.001));
        xxyy.y += 1.3*(-1. + 2.*fbm3(xxyy*frq*vec2(1., 1.)+223.123, 9.*uTime*.001));
        float light = dot(xxyy-.5, lightdir);
        light = (light+1.0)/2.;
        light = clamp(light, 0.0, 1.0);

        // gl_FragColor = vec4(brushRgb.rgb*alpha, alpha); // using alpha
        gl_FragColor = vec4(brushRgb.rgb*alpha, alpha); // using alpha
        gl_FragColor = vec4(vec3(ff2), alpha); // using alpha
        gl_FragColor = vec4(brushRgb.rgb*alpha, alpha); // using alpha

        if(uIsBump > .5){
            // gl_FragColor = vec4(vec3(light)*light*light*light*light, .15*light); // using alpha


            float dist1 = distance(xxyy, vec2(0.5, 0.5));
            float dist2 = dist1;
            dist1 = 1. - dist1;
            dist2 = 1. - dist2;
            dist1 = 1.-smoothstep(0.2, .5, dist1);
            dist2 = smoothstep(0.3, .5, dist2);
            gl_FragColor = vec4(vec3(dist1), dist1);
            gl_FragColor = vec4(vec3(dist2), dist1);
            gl_FragColor = vec4(vec3(light)*light, light);
        }
    }
`;


// Shader sources (You can use separate shaders for the color picker)
export const pickerVertexShader = `
    attribute vec2 aVertexPosition;
    void main(void) {
        gl_Position = vec4(aVertexPosition, 0.0, 1.0);
    }
`;

export const pickerFragmentShader = `
    precision mediump float;
    uniform vec3 uHueSatVal;
    
    float lum(float r, float g, float b) {
        return sqrt(0.299*r*r + 0.587*g*g + 0.114*b*b);
        // return sqrt(0.2126*r + 0.7152*g + 0.0722*b);
    }


    float hue2rgb(float p, float q, float t) {
        if (t < 0.0) t += 1.0;
        if (t > 1.0) t -= 1.0;
        if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
        if (t < 0.5) return q;
        if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
        return p;
    }

    vec3 hsl2rgb(float h, float s, float l) {

        float r, g, b;
        if (s == 0.0) {
            r = g = b = l; // achromatic
        } else {
            float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
            float p = 2.0 * l - q;
            r = hue2rgb(p, q, h + 1.0 / 3.0);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1.0 / 3.0);
        }

        return vec3(r, g, b);
    }

    vec3 hsx2rgb(float hue, float sat, float targetLuminance) {
        
        const float epsilon = 0.001;
        float low = 0.0;
        float high = 1.0;
        float mid;

        for(int i = 0; i < 16; i++) { // Limiting the number of iterations for performance
            mid = (low + high) * 0.5;
            vec3 rgb = hsl2rgb(hue, sat, mid);
            float currentLum = lum(rgb.r, rgb.g, rgb.b);

            if (currentLum < targetLuminance) {
                low = mid;
            } else {
                high = mid;
            }

            if (high - low < epsilon) {
                break; 
            }
        }

        return hsl2rgb(hue, sat, mid);
    }

    float degreesToRadians(float degrees) {
        return (degrees * 3.141592653589793) / 180.0;
    }
    
    float labF(float t) {
        return t > (6.0 / 29.0) * (6.0 / 29.0) * (6.0 / 29.0) ? pow(t, 0.33333) : t / (3.0 * (6.0 / 29.0) * (6.0 / 29.0)) + 4.0 / 29.0;
    }
    
    float labInverseF(float t) {
        return t > 6.0 / 29.0 ? t * t * t : 3.0 * (6.0 / 29.0) * (6.0 / 29.0) * (t - 4.0 / 29.0);
    }
    
    // Conversion: LCH to CIELAB
    vec3 lchToLab(float l, float c, float h) {
        l *= 100.0; // Scale from [0,1] to [0,100]
        c *= 128.0; // Scale from [0,1] to [0,128]
        h *= 360.0; // Scale from [0,1] to [0,360]
        
        float a = c * cos(degreesToRadians(h));
        float b = c * sin(degreesToRadians(h));
        return vec3(l, a, b);
    }
    
    // Conversion: CIELAB to XYZ
    vec3 labToXYZ(vec3 lab) {
        vec3 D65 = vec3(0.95047, 1.00000, 1.08883); // D65 illuminant
        float y = (lab.x + 16.0) / 116.0;
        float x = y + lab.y / 500.0;
        float z = y - lab.z / 200.0;
        return vec3(
            D65.x * labInverseF(x),
            D65.y * labInverseF(y),
            D65.z * labInverseF(z)
        );
    }
    
    // Conversion: XYZ to RGB
    vec3 xyzToRgb(vec3 xyz) {
        float r = xyz.x *  3.2404542 + xyz.y * -1.5371385 + xyz.z * -0.4985314;
        float g = xyz.x * -0.9692660 + xyz.y *  1.8760108 + xyz.z *  0.0415560;
        float b = xyz.x *  0.0556434 + xyz.y * -0.2040259 + xyz.z *  1.0572252;
        return vec3(
            clamp(r, 0.0, 1.0),
            clamp(g, 0.0, 1.0),
            clamp(b, 0.0, 1.0)
        );
    }
    
    // Wrapper function to convert LCH to RGB
    vec3 lchToRgb(float l, float c, float h) {
        vec3 lab = lchToLab(h, c, l);
        vec3 xyz = labToXYZ(lab);
        return xyzToRgb(xyz);
    }

    vec3 srgb_transfer_function(vec3 a) {
        return vec3(
            a.r <= 0.0031308 ? 12.92 * a.r : 1.055 * pow(a.r, 1.0 / 2.4) - 0.055,
            a.g <= 0.0031308 ? 12.92 * a.g : 1.055 * pow(a.g, 1.0 / 2.4) - 0.055,
            a.b <= 0.0031308 ? 12.92 * a.b : 1.055 * pow(a.b, 1.0 / 2.4) - 0.055
        );
    }
    
    vec3 srgb_transfer_function_inv(vec3 a) {
        return vec3(
            a.r > 0.04045 ? pow((a.r + 0.055) / 1.055, 2.4) : a.r / 12.92,
            a.g > 0.04045 ? pow((a.g + 0.055) / 1.055, 2.4) : a.g / 12.92,
            a.b > 0.04045 ? pow((a.b + 0.055) / 1.055, 2.4) : a.b / 12.92
        );
    }
    
    vec3 linear_srgb_to_oklab(vec3 rgb) {
        float l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
        float m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
        float s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;
    
        float l_ = pow(l, 1.0 / 3.0);
        float m_ = pow(m, 1.0 / 3.0);
        float s_ = pow(s, 1.0 / 3.0);
    
        return vec3(
            0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
        );
    }
    
    vec3 oklab_to_linear_srgb(vec3 lab) {
        float l_ = lab.r + 0.3963377774 * lab.g + 0.2158037573 * lab.b;
        float m_ = lab.r - 0.1055613458 * lab.g - 0.0638541728 * lab.b;
        float s_ = lab.r - 0.0894841775 * lab.g - 1.291485548 * lab.b;
    
        float l = l_ * l_ * l_;
        float m = m_ * m_ * m_;
        float s = s_ * s_ * s_;
    
        return vec3(
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
        );
    }

    vec3 okhsl_to_oklab(float H, float S, float L) {
        float a = S * cos(H * 3.141592653589793 / 180.0); // Convert degrees to radians
        float b = S * sin(H * 3.141592653589793 / 180.0);
        return vec3(L, a, b);
    }

    vec3 okhsl_to_linear_srgb(float H, float S, float L) {
        vec3 oklab = okhsl_to_oklab(H, S, L);
        return oklab_to_linear_srgb(vec3(oklab.x, oklab.y, oklab.z));
    }

    vec3 linear_to_srgb(vec3 lin) {
        return vec3(
            srgb_transfer_function(lin)
        );
    }
    
    vec3 okhsl_to_srgb(float H, float S, float L) {
        vec3 linear = okhsl_to_linear_srgb(H, S, L);
        return linear_to_srgb(linear);
    }
    

    float power(float p, float g) {
        if (p < 0.5)
            return 0.5 * pow(2.*p, g);
        else
            return 1. - 0.5 * pow(2.*(1. - p), g);
    }

    
    vec4 Saturate(vec4 inc, float sat) {
        if (abs(sat)<0.004) {return inc;}  //Immediately return when sat is zero or so small no difference will result (less than 1/255)
        if ((inc.r==0.0)&&(inc.g==0.0)&&(inc.b==0.0)) {return inc;}  //Prevents division by zero trying to saturate black
    
        vec4 outc;
        vec3 clerp=vec3(inc.r,inc.g,inc.b);
    
        if (sat>0.0) {
            vec3 maxsat;
            float mx=max(max(inc.r,inc.g),inc.b);
            maxsat=clerp*1.0/mx;
            clerp=mix(clerp,maxsat,sat);
        }
        if (sat<0.0) {
            vec3 grayc;
            float avg=(inc.r+inc.g+inc.b)/3.;
            grayc=vec3(avg);
            clerp=mix(clerp,grayc,-1.0*sat);
        }
        outc=vec4(clerp.xyz, 1.);
        return outc;
        return vec4(1.);
    }

    
    vec4 Xform_RYB2RGB(float r, float y, float b) {
        float rin=r;
        float yin=y;
        float bin=b;


        //The values defined here are where the magic happens.  You can experiment with changing the values and see if you find a better set.  If so, notify me on GitHub @ProfJski !
        //I have included a few alternative sets below

        //RYB corners in RGB values
        //Values arranged to approximate an artist's color wheel
        vec3 CG000=vec3(0.0,0.0,0.0); //Black
        vec3 CG100=vec3(1.0,0.0,0.0); //Red
        vec3 CG010=vec3(0.9,0.9,0.0); //Yellow = RGB Red+Green.  Still a bit high, but helps Yellow compete against Green.  Lower gives murky yellows.
        vec3 CG001=vec3(0.0,0.36,1.0); //Blue: Green boost of 0.36 helps eliminate flatness of spectrum around pure Blue
        vec3 CG011=vec3(0.0,0.9,0.2); //Green: A less intense green than {0,1,0}, which tends to dominate
        vec3 CG110=vec3(1.0,0.6,0.0); //Orange = RGB full Red, 60% Green
        vec3 CG101=vec3(0.6,0.0,1.0); //Purple = 60% Red, full Blue
        vec3 CG111=vec3(1.0,1.0,1.0); //White

        //Trilinear interpolation from RYB to RGB
        vec3 C00,C01,C10,C11;
        C00=CG000*(1.0-rin) + CG100*rin;
        C01=CG001*(1.0-rin) + CG101*rin;
        C10=CG010*(1.0-rin) + CG110*rin;
        C11=CG011*(1.0-rin) + CG111*rin;

        vec3 C0,C1;
        C0=C00*(1.0-yin) + C10*yin;
        C1=C01*(1.0-yin) + C11*yin;

        vec3 C;
        C=C0*(1.0-bin) + C1*bin;

        vec4 CRGB=vec4(C.x,C.y,C.z,1.);
        CRGB=vec4(r,y,b,1.);

        return CRGB;
    }

    vec4 Xform_RGB2RYB(float r, float g, float b) {
        float rin=r;
        float gin=g;
        float bin=b;
    
        //Finding the appropriate values for the inverse transform was no easy task.  After some experimentation, I wrote a separate program that used
        //the calculus of variations to help tweak my guesses towards values that provided a closer round-trip conversion from RGB to RYB to RGB again.
    
        //RGB corners in RYB values
        vec3 CG000=vec3(0.0,0.0,0.0); //Black
        vec3 CG100=vec3(0.891,0.0,0.0); //Red
        vec3 CG010=vec3(0.0,0.714,0.374); //Green = RYB Yellow + Blue
        vec3 CG001=vec3(0.07,0.08,0.893); //Blue:
        vec3 CG011=vec3(0.0,0.116,0.313); //Cyan = RYB Green + Blue.  Very dark to make the rest of the function work correctly
        vec3 CG110=vec3(0.0,0.915,0.0); //Yellow
        vec3 CG101=vec3(0.554,0.0,0.1); //Magenta =RYB Red + Blue.  Likewise dark.
        vec3 CG111=vec3(1.0,1.0,1.0); //White
    
        //Trilinear interpolation from RGB to RYB
        vec3 C00,C01,C10,C11;
        C00=CG000*(1.0-rin) + CG100*rin;
        C01=CG001*(1.0-rin) + CG101*rin;
        C10=CG010*(1.0-rin) + CG110*rin;
        C11=CG011*(1.0-rin) + CG111*rin;
    
        vec3 C0,C1;
        C0=C00*(1.0-gin) + C10*gin;
        C1=C01*(1.0-gin) + C11*gin;
    
        vec3 C;
        C=C0*(1.0-bin) + C1*bin;
    
        vec4 CRYB=Saturate(vec4(C, 1.),0.5);
    
        return CRYB;
    }
    
    
    vec4 ColorMix(vec4 a, vec4 b, float blend) {
        vec4 outc;
        outc.r=sqrt((1.0-blend)*(a.r*a.r)+blend*(b.r*b.r));
        outc.g=sqrt((1.0-blend)*(a.g*a.g)+blend*(b.g*b.g));
        outc.b=sqrt((1.0-blend)*(a.b*a.b)+blend*(b.b*b.b));
        outc.a=(1.0-blend)*a.a+blend*b.a;
    
        return outc;
    }
    
    vec4 ColorMixLin(vec4 a, vec4 b, float blend) {
        vec4 outc;
        outc.r=(1.0-blend)*a.r+blend*b.r;
        outc.g=(1.0-blend)*a.g+blend*b.g;
        outc.b=(1.0-blend)*a.b+blend*b.b;
        outc.a=(1.0-blend)*a.a+blend*b.a;
    
        return outc;
    }

    
    vec4 ColorInv(vec4 inc) {
        return vec4(1.-inc.rgb, inc.a);
    }

    vec4 Brighten(vec4 inc, float bright) {
        if (bright==0.0) { return inc;}

        vec4 outc;
        if (bright>0.0) {
            outc=ColorMix(inc,vec4(1.,1.,1.,1.),bright);
        }

        if (bright<0.0) {
            outc=ColorMix(inc,vec4(0.,0.,0.,1.),-1.0*bright);
        }
        return outc;
    }


    float ColorDistance(vec4 a, vec4 b) {
        float outc=((a.r-b.r)*(a.r-b.r)+(a.g-b.g)*(a.g-b.g)+(a.b-b.b)*(a.b-b.b));
        outc=sqrt(outc)/(sqrt(3.0)*1.); //scale to 0-1
        return outc;
    }

    vec4 ColorMixSub(vec4 a, vec4 b, float blend) {
        vec4 outc;
        vec4 c,d,f;

        c=ColorInv(a);
        d=ColorInv(b);

        f.r=max(0.,1.-c.r-d.r);
        f.g=max(0.,1.-c.g-d.g);
        f.b=max(0.,1.-c.b-d.b);

        float cd=ColorDistance(a,b);
        cd=4.0*blend*(1.0-blend)*cd;
        outc=ColorMixLin(ColorMixLin(a,b,blend),f,cd);

        outc.a=1.;
        return outc;
    }

    
    float step2(float ang) {
        float outValue = 0.0;
        float sc = 0.0;
    
        float deg = ang * 360.0;

        deg = mod(deg+360.0*4., 360.0);
    
        if (deg <= 60.0) {
            outValue = 1.0;
        } else if (deg > 60.0 && deg <= 120.0) {
            sc = (deg - 60.0) / 60.0;
            outValue = 1.0 - 2.0 * sc / sqrt(1.0 + 3.0 * sc * sc);
        } else if (deg > 120.0 && deg <= 240.0) {
            outValue = 0.0;
        } else if (deg > 240.0 && deg <= 300.0) {
            sc = (deg - 240.0) / 60.0;
            outValue = 2.0 * sc / sqrt(1.0 + 3.0 * sc * sc);
        } else if (deg > 300.0 && deg <= 360.0) {
            outValue = 1.0;
        }
    
        return outValue;
    }
    
    vec4 map2(float ang) {
        float r = step2(ang);
        float y = step2(ang - 120. / 360.);
        float b = step2(ang - 240. / 360.);
        return Xform_RYB2RGB(r, y, b);
    }

    vec3 rgb2hsl(float r, float g, float b){
        float maxx = max(r, max(g, b));
        float minn = min(r, min(g, b));
        float h, s, l = (maxx + minn) / 2.;
    
        if(maxx == minn){
            h = s = 0.; // achromatic
        }else{
            float d = maxx - minn;
            s = l > 0.5 ? d / (2. - maxx - minn) : d / (maxx + minn);
            if(maxx == r)
                h = (g - b) / d + (g < b ? 6. : 0.);
            if(maxx == g)
                h = (b - r) / d + 2.;
            if(maxx == b)
                h = (r - g) / d + 4.;
            h /= 6.;
        }
    
        return vec3(h, s, l);
    }

    void main(void) {
        float xx = power(gl_FragCoord.x / 200.0, 1.);
        float yy = gl_FragCoord.y / 200.0;

        vec3 ryb = map2(xx).rgb;
        float huue = rgb2hsl(ryb.r, ryb.g, ryb.b).r;

        vec3 color = hsx2rgb(xx+huue*0., yy, uHueSatVal.b);

        float dist = distance(gl_FragCoord.xy, vec2(200.0*uHueSatVal.r, 200.0*uHueSatVal.g));

        float mask1 = smoothstep(10.0, 11.0, dist);
        float mask2 = 1. - smoothstep(11.0, 12.0, dist);
        float mask = mask1 * mask2;

        float ringval = 1.0;
        if(uHueSatVal.b > 0.55)
            ringval = 0.0;
        color = mix(color, vec3(ringval), mask);

        gl_FragColor = vec4(color.rgb, 1.0);
    }
`;

// Vertex Shader
export const screenVertexQuadSource = `
    attribute vec2 aVertexPosition;
    varying vec2 vTexCoords;
    void main() {
        vTexCoords = aVertexPosition * 0.5 + 0.5; // Convert from [-1, 1] to [0, 1]
        gl_Position = vec4(aVertexPosition, 0.0, 1.0);
    }
`;

// Fragment Shader
export const screenFragmentQuadSource = `
    precision mediump float;
    varying vec2 vTexCoords;
    uniform vec2 uResolution;

    uniform sampler2D uTexture;
    uniform sampler2D uBumpTexture;

    float lum(float r, float g, float b) {
        return sqrt(0.299*r*r + 0.587*g*g + 0.114*b*b);
        // return sqrt(0.2126*r + 0.7152*g + 0.0722*b);
    }


    float hue2rgb(float p, float q, float t) {
        if (t < 0.0) t += 1.0;
        if (t > 1.0) t -= 1.0;
        if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
        if (t < 0.5) return q;
        if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
        return p;
    }

    vec3 hsl2rgb(float h, float s, float l) {

        float r, g, b;
        if (s == 0.0) {
            r = g = b = l; // achromatic
        } else {
            float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
            float p = 2.0 * l - q;
            r = hue2rgb(p, q, h + 1.0 / 3.0);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1.0 / 3.0);
        }

        return vec3(r, g, b);
    }

    vec3 hsx2rgb(float hue, float sat, float targetLuminance) {
        
        const float epsilon = 0.001;
        float low = 0.0;
        float high = 1.0;
        float mid;

        for(int i = 0; i < 16; i++) { // Limiting the number of iterations for performance
            mid = (low + high) * 0.5;
            vec3 rgb = hsl2rgb(hue, sat, mid);
            float currentLum = lum(rgb.r, rgb.g, rgb.b);

            if (currentLum < targetLuminance) {
                low = mid;
            } else {
                high = mid;
            }

            if (high - low < epsilon) {
                break; 
            }
        }

        return hsl2rgb(hue, sat, mid);
    }

    
    float power(float p, float g) {
        if (p < 0.5)
            return 0.5 * pow(2.*p, g);
        else
            return 1. - 0.5 * pow(2.*(1. - p), g);
    }

    void main() {

        vec2 coords = vTexCoords * uResolution;

        vec4 original = texture2D(uTexture, vTexCoords);
        vec4 bumpTex = texture2D(uBumpTexture, vTexCoords);

        float bump = bumpTex.r;
        // bump = max(.4, bump);
        // bump = pow(bump, 2.);
        // bump = clamp(bump, 0., 1.);
        // bump = .7+.3*bump;

        float gradx = texture2D(uBumpTexture, vec2(vTexCoords.x+1./uResolution.x, vTexCoords.y)).r - texture2D(uBumpTexture, vec2(vTexCoords.x-1./uResolution.x, vTexCoords.y)).r;
        float grady = texture2D(uBumpTexture, vec2(vTexCoords.x, vTexCoords.y+1./uResolution.y)).r - texture2D(uBumpTexture, vec2(vTexCoords.x, vTexCoords.y-1./uResolution.y)).r;

        vec2 grad = vec2(gradx, grady);
        grad = normalize(grad);

        vec2 lighdir = vec2(1., 1.);
        lighdir = normalize(lighdir);

        float d = dot(grad, lighdir);

        float angle = atan(grad.y, grad.x);
        angle = angle + 3.14;

        d = abs(d);

        vec3 color = hsx2rgb(angle/6.28, 1., d);


        // d = (d + 1.) / 2.;

        vec3 result = clamp(original.rgb + .05*(-.5+bump), 0., 1.);

        // gl_FragColor = vec4(grad.x*.5+.5, grad.y*.5+.5, 0., original.a);
        // gl_FragColor = vec4(d,d,d, original.a);
        // gl_FragColor = vec4(original.rgb, original.a);
        // gl_FragColor = vec4(original.aaa, original.a);
        // gl_FragColor = vec4(original.aaa, 1.);
        // gl_FragColor = vec4(original.rgb, original.a);
        // gl_FragColor = vec4(vec3(bump), original.a);
        gl_FragColor = vec4(vec3(color), original.a);
        gl_FragColor = vec4(vec3(original*bump), original.a);
        gl_FragColor = vec4(vec3(texture2D(uBumpTexture, vTexCoords).rgb), 1.);
        gl_FragColor = vec4(bumpTex.rgb, bumpTex.a);
        gl_FragColor = vec4(result, original.a);
    }
`;


export function initShaderProgram(gll, vsSource, fsSource) {
    const vertexShader = loadShader(gll, gll.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gll, gll.FRAGMENT_SHADER, fsSource);

    const shaderProgram = gll.createProgram();
    gll.attachShader(shaderProgram, vertexShader);
    gll.attachShader(shaderProgram, fragmentShader);
    gll.linkProgram(shaderProgram);

    return shaderProgram;
}

function loadShader(gll, type, source) {
    const shader = gll.createShader(type);
    gll.shaderSource(shader, source);
    gll.compileShader(shader);

    if (!gll.getShaderParameter(shader, gll.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gll.getShaderInfoLog(shader));
        gll.deleteShader(shader);
        return null;
    }

    return shader;
}

export function createQuadBuffer(gl) {
    const vertices = new Float32Array([
        -1, -1,
        1, -1,
        1, 1,
        -1, 1,
    ]);

    let quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    return quadBuffer;
}
