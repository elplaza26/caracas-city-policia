create function public.admit_police_preselection(
 p_user text,p_operation uuid,p_actor text,p_name text,p_plate text,p_steam text,
 p_approved_by text,p_unit text,p_expected_updated_at timestamptz,p_actor_name text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare candidate public.police_preselections; profile public.police_personnel; prior public.police_rank_requests;
begin
 if p_user !~ '^[0-9]{17,20}$' or p_actor !~ '^[0-9]{17,20}$' or p_operation is null
 or coalesce(length(trim(p_name)),0) not between 1 and 100 or coalesce(length(trim(p_plate)),0) not between 1 and 30
 or coalesce(length(trim(p_steam)),0) not between 1 and 100 or coalesce(length(trim(p_approved_by)),0) not between 1 and 100
 or p_unit not in ('POLICIA','UCOP','CIC') then return jsonb_build_object('ok',false,'error','Revisa los datos del ingreso.');end if;
 perform pg_advisory_xact_lock(hashtextextended('admission:'||p_user,0));
 select * into prior from public.police_rank_requests where id=p_operation;
 if found then
  if prior.discord_user_id=p_user and prior.status='accepted' and prior.review_reason='Ingreso administrativo desde Preseleccionados.' then
   select * into profile from public.police_personnel where discord_user_id=p_user;
   return jsonb_build_object('ok',true,'existing',true,'personnel',to_jsonb(profile));
  end if;
  return jsonb_build_object('ok',false,'error','La referencia de este ingreso ya se utilizó. Actualiza la lista.');
 end if;
 select * into candidate from public.police_preselections where discord_user_id=p_user for update;
 if not found or candidate.status<>'active' then return jsonb_build_object('ok',false,'error','La persona ya no está pendiente en Preseleccionados.');end if;
 if p_expected_updated_at is not null and candidate.updated_at is distinct from p_expected_updated_at then return jsonb_build_object('ok',false,'error','La preselección cambió. Actualiza la lista antes de ingresar.');end if;
 if exists(select from public.police_personnel where discord_user_id=p_user) then return jsonb_build_object('ok',false,'error','Ya existe una ficha de este agente. Revísala en Personal.');end if;
 perform pg_advisory_xact_lock(hashtextextended('police-plate:'||trim(p_plate),0));
 if exists(select from public.police_personnel where plate=trim(p_plate) and status='active') then return jsonb_build_object('ok',false,'error','La placa ya está asignada a otro agente activo.');end if;
 insert into public.police_personnel(discord_user_id,discord_username,full_name,name_ooc,steam_username,plate,unit,rank_name,rank_role_id,status,source_application_id)
 values(p_user,candidate.discord_username,trim(p_name),candidate.discord_username,trim(p_steam),trim(p_plate),p_unit,'Pendiente de asignación',null,'active',candidate.source_application_id) returning * into profile;
 update public.police_preselections set status='converted',converted_at=now(),updated_at=now() where discord_user_id=p_user;
 update public.police_rank_requests set status='rejected',review_reason='Resuelta mediante ingreso administrativo desde Preseleccionados.',reviewed_by_discord_id=p_actor,reviewed_by_name=p_actor_name,reviewed_at=now(),updated_at=now() where discord_user_id=p_user and status='pending';
 insert into public.police_rank_requests(id,discord_user_id,discord_username,character_name,plate,steam_username,requested_rank_name,approved_by_name,status,reviewed_by_discord_id,reviewed_by_name,reviewed_at,review_reason)
 values(p_operation,p_user,candidate.discord_username,trim(p_name),trim(p_plate),trim(p_steam),'Solo rol de Policía (sin rango configurado)',trim(p_approved_by),'accepted',p_actor,p_actor_name,now(),'Ingreso administrativo desde Preseleccionados.');
 insert into public.police_audit_events(action,fields)values('Ingreso administrativo desde Preseleccionados',jsonb_build_array(jsonb_build_object('name','Agente','value',trim(p_name)),jsonb_build_object('name','Placa','value',trim(p_plate)),jsonb_build_object('name','Gestor','value',p_actor_name),jsonb_build_object('name','Entrevista IC aprobada por','value',trim(p_approved_by))));
 return jsonb_build_object('ok',true,'existing',false,'personnel',to_jsonb(profile));
end $$;
revoke all on function public.admit_police_preselection(text,uuid,text,text,text,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.admit_police_preselection(text,uuid,text,text,text,text,text,text,timestamptz,text) to service_role;
