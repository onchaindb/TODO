import {NextRequest, NextResponse} from 'next/server';
import {AuthInfo, Fee, ModeInfo, ModeInfo_Single, SignerInfo, TxBody, TxRaw} from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import {PubKey} from 'cosmjs-types/cosmos/crypto/secp256k1/keys';
import {Any} from 'cosmjs-types/google/protobuf/any';
import {MsgSend} from 'cosmjs-types/cosmos/bank/v1beta1/tx';
import {fromBase64, toBase64} from '@cosmjs/encoding';

const CELESTIA_REST = 'https://api-mocha.pops.one';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {signedTx} = body;

        console.log('📡 Converting amino signature to protobuf (user pays fees)...');

        const {signed, signature} = signedTx;

        console.log('💰 User transaction (signed with user key):', {
            from: signed.msgs[0].value.from_address,
            to: signed.msgs[0].value.to_address,
            amount: signed.msgs[0].value.amount[0],
            memo: signed.memo,
            account_number: signed.account_number,
            sequence: signed.sequence,
            chain_id: signed.chain_id
        });

        // Convert Amino signed transaction to protobuf format
        const msg = signed.msgs[0];

        // Create MsgSend protobuf message
        const msgSend = MsgSend.fromPartial({
            fromAddress: msg.value.from_address,
            toAddress: msg.value.to_address,
            amount: msg.value.amount,
        });

        // Encode as Any type
        const msgAny = Any.fromPartial({
            typeUrl: "/cosmos.bank.v1beta1.MsgSend",
            value: MsgSend.encode(msgSend).finish(),
            key: Math.random().toString(16) as never
        });

        // Create TxBody
        const txBody = TxBody.fromPartial({
            messages: [msgAny],
            memo: signed.memo,
        });

        // Create public key
        const pubKey = PubKey.fromPartial({
            key: fromBase64(signature.pub_key.value)
        });

        const pubKeyAny = Any.fromPartial({
            typeUrl: "/cosmos.crypto.secp256k1.PubKey",
            value: PubKey.encode(pubKey).finish()
        });

        // Create signer info
        const signerInfo = SignerInfo.fromPartial({
            publicKey: pubKeyAny,
            modeInfo: ModeInfo.fromPartial({
                single: ModeInfo_Single.fromPartial({
                    mode: 127 // SIGN_MODE_LEGACY_AMINO_JSON (since we're using amino signing)
                })
            }),
            sequence: parseInt(signed.sequence) as never || 0
        });

        // Create fee
        const fee = Fee.fromPartial({
            amount: signed.fee.amount,
            gasLimit: parseInt(signed.fee.gas) as never || 200000
        });

        // Create AuthInfo
        const authInfo = AuthInfo.fromPartial({
            signerInfos: [signerInfo],
            fee: fee
        });

        // Create TxRaw
        const txRaw = TxRaw.fromPartial({
            bodyBytes: TxBody.encode(txBody).finish(),
            authInfoBytes: AuthInfo.encode(authInfo).finish(),
            signatures: [fromBase64(signature.signature)]
        });

        console.log('🔧 Encoding protobuf transaction...');

        const txBytes = TxRaw.encode(txRaw).finish();

        // Use Cosmos REST API format for broadcasting
        const broadcastBody = {
            tx_bytes: toBase64(txBytes),
            mode: "BROADCAST_MODE_SYNC"
        };

        console.log('🚀 Broadcasting to Celestia REST API (charges user wallet)...');

        // Use Cosmos REST API endpoint
        const response = await fetch(`${CELESTIA_REST}/cosmos/tx/v1beta1/txs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(broadcastBody),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('❌ REST API Error:', error);
            return NextResponse.json(
                {
                    success: false,
                    error: `REST broadcast failed: ${error}`
                },
                {status: response.status}
            );
        }

        const result = await response.json();

        // Cosmos REST API returns different format
        const txResponse = result.tx_response;

        if (!txResponse) {
            console.error('❌ No tx_response in result:', result);
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid response format from Celestia'
                },
                {status: 400}
            );
        }

        const code = txResponse.code || 0;
        const txHash = txResponse.txhash;

        if (code !== 0) {
            console.error('❌ Transaction failed with code:', code, txResponse.raw_log);
            return NextResponse.json({
                success: false,
                error: `Transaction failed with code ${code}: ${txResponse.raw_log}`,
                tx_hash: txHash
            });
        }

        console.log('✅ User transaction successful via REST API:', txHash);

        return NextResponse.json({
            success: true,
            tx_hash: txHash,
            code: code,
            height: txResponse.height || 0,
            gas_used: txResponse.gas_used || 0
        });

    } catch (error: any) {
        console.error('Broadcast API error:', error);
        return NextResponse.json(
            {error: error.message || 'Failed to broadcast transaction'},
            {status: 500}
        );
    }
}
