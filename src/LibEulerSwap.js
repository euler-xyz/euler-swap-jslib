import { parseUnits, getAddress, parseAbi, encodeAbiParameters, encodePacked, keccak256, fromHex, toHex } from 'viem';
import { generatePrivateKey } from 'viem/accounts';

import iEulerSwapAbi from './IEulerSwap.json';

const c1e18 = 10n**18n;
const paramsAbi = iEulerSwapAbi.abi.find(item => item.name === 'getParams').outputs;


//// Pool Creation

export async function genAddress(readClient, eulerSwapFactory, params) {
    let mask = BigInt(2**14 - 1);
    let requiredHooks = 10408n;

    let salt = fromHex(generatePrivateKey(), 'bigint');
    let creationCodeHash = keccak256(await creationCode(readClient, eulerSwapFactory, params));

    while (true) {
        salt++;
        let saltHex = toHex(salt, { size: 32 });

        let a = encodePacked(['bytes1', 'address', 'bytes32', 'bytes32'], ['0xFF', eulerSwapFactory, saltHex, creationCodeHash]);
        a = keccak256(a);

        if ((fromHex(a, 'bigint') & mask) === requiredHooks) {
            return [getAddress('0x' + a.substr(26)), saltHex];
        }
    }
}

export async function creationCode(readClient, eulerSwapFactory, params) {
    let BYTECODE_HEAD = '600b380380600b3d393df3363d3d373d3d3d3d60368038038091363936013d73';
    let BYTECODE_TAIL = '5af43d3d93803e603457fd5bf3';

    let eulerSwapImpl = await readClient.readContract({
        address: eulerSwapFactory,
        abi: parseAbi(['function eulerSwapImpl() external view returns (address)']),
        functionName: 'eulerSwapImpl',
        args: [],
    });

    let encoded = encodeAbiParameters(paramsAbi, [params]);

    return '0x' + BYTECODE_HEAD + eulerSwapImpl.substr(2) + BYTECODE_TAIL + encoded.substr(2);
}





//// Pricing Helpers

export function getCurrentPrice(params, reserve0, reserve1) {
    let price;

    if (reserve0 <= params.equilibriumReserve0) {
        if (reserve0 === params.equilibriumReserve0) return params.priceX * c1e18 / params.priceY;
        price = -df_dx(reserve0, params.priceX, params.priceY, params.equilibriumReserve0, params.concentrationX);
    } else {
        if (reserve1 === params.equilibriumReserve1) return params.priceY * c1e18 / params.priceX;
        price = -df_dx(reserve1, params.priceY, params.priceX, params.equilibriumReserve1, params.concentrationY);
        price = c1e18 * c1e18 / price;
    }

    return price;
}

export function verifyPoint(params, reserve0, reserve1) {
    return verify(
        reserve0,
        reserve1,
        params.priceX,
        params.priceY,
        params.equilibriumReserve0,
        params.equilibriumReserve1,
        params.concentrationX,
        params.concentrationY
    );
}

export function verifyOnCurveExact(params, x, y) {
    let v1 = verifyPoint(params, x, y);
    let v2 = x === 0n || !verifyPoint(params, x - 1n, y);
    let v3 = y === 0n || !verifyPoint(params, x, y - 1n);

    return (v1 && v2 && v3);
}

export function tightenToCurve(params, x, y) {
    if (!verifyPoint(params, x, y)) throw Error('not on or above curve');
    if (verifyOnCurveExact(params, x, y)) return [x, y];

    let tighten = (dim) => {
        let val = 1n;

        // Phase 1: Keep doubling skim amount until it fails

        while (true) {
            let [tx, ty] = dim ? [x - val, y] : [x, y - val];

            if (verifyPoint(params, tx, ty)) {
                [x, y] = [tx, ty];
                val *= 2n;
            } else {
                break;
            }
        }

        // Phase 2: Keep halving skim amount until 1 wei skim fails

        while (true) {
            if (val > 1n) val /= 2n;

            let [tx, ty] = dim ? [x - val, y] : [x, y - val];

            if (verifyPoint(params, tx, ty)) {
                [x, y] = [tx, ty];
            } else {
                if (val === 1n) break;
            }
        }
    };

    tighten(true);
    tighten(false);

    return [x, y];
}

export function computePriceFraction(price, decimals0, decimals1) {
    let price18scale;
    let inverted = false;

    try {
        price = parseFloat(price);
        if (isNaN(price) || !price) throw Error('not a valid price');
        if (price < 1) {
            inverted = true;
            price = 1 / price;
        }
        price18scale = parseUnits(price.toString(), 18);
    } catch (e) {
        return [undefined, undefined];
    }

    let output = [
        10n**(BigInt(decimals1)),
        10n**(BigInt(decimals0)),
    ];

    if (!inverted) {
        output[0] = output[0] * price18scale / c1e18;
    } else {
        output[1] = output[1] * price18scale / c1e18;
    }

    return output;
}






// Curve Math

export function f(x, px, py, x0, y0, c) {
    let v = (px * (x0 - x)) * (c * x + (c1e18 - c) * x0);
    let denom = x * c1e18;
    v = (v + (denom - 1n)) / denom;
    return y0 + (v + (py - 1n)) / py;
}

export function verify(x, y, px, py, x0, y0, cx, cy) {
    if (x >= x0) {
        if (y >= y0) return true;
        return x >= f(y, py, px, y0, x0, cy);
    } else {
        if (y < y0) return false;
        return y >= f(x, px, py, x0, y0, cx);
    }
}

export function df_dx(x, px, py, x0, cx) {
    const r = (((x0 * x0) / x) * c1e18) / x;
    return (-px * (cx + ((c1e18 - cx) * r) / c1e18)) / py;
}

function computeScale(x) {
    let bits = 0n;
    let remaining = x;
    while (remaining > 0n) {
        remaining >>= 1n;
        bits++;
    }

    if (bits > 128n) {
        const excessBits = bits - 128n;
        return 1n << excessBits;
    }

    return 1n;
}

function sqrtCeil(x) {
    if (x < 0n) {
        throw new Error("Square root of negative number");
    }
    if (x < 2n) {
        return x;
    }

    function newtonIteration(n, x0) {
        const x1 = (n / x0 + x0) >> 1n;
        if (x0 === x1 || x0 === x1 - 1n) {
            return x0;
        }
        return newtonIteration(n, x1);
    }

    const r = newtonIteration(x, 1n << (BigInt(x.toString(2).length) >> 1n));
    return r * r < x ? r + 1n : r;
}

export function fInverse(y, px, py, x0, y0, cx) {
    const term1 = mulDivCeil(py * c1e18, y - y0, px);
    const term2 = (2n * cx - c1e18) * x0;
    const B = (term1 - term2) / c1e18;
    const C = mulDivCeil((c1e18 - cx), x0 * x0, c1e18);
    const fourAC = mulDivCeil(4n * cx, C, c1e18);

    const absB = B >= 0n ? B : -B;

    let sqrt = 0n;
    let squaredB = 0n;
    let discriminant = 0n;
    if (absB < 10n ** 36n) {
        squaredB = absB * absB;
        discriminant = squaredB + fourAC;
        sqrt = sqrtCeil(discriminant);
    } else {
        const scale = computeScale(absB);
        squaredB = mulDivCeil(absB / scale, absB, scale);
        discriminant = squaredB + fourAC / (scale * scale);
        sqrt = sqrtCeil(discriminant);
        sqrt = sqrt * scale;
    }

    let x = 0n;
    if (B <= 0n) {
        x = mulDivCeil((absB + sqrt), c1e18, 2n * cx) + 1n;
    } else {
        x = ceilDiv((2n * C), (absB + sqrt)) + 1n;
    }

    if (x >= x0) {
        return x0;
    }

    return x;
}

function mulDivCeil(x, y, denominator) {
    return (x * y + denominator - 1n) / denominator;
}

function ceilDiv(x, y) {
    return (x + y - 1n) / y;
}
