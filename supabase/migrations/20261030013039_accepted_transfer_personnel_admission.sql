alter table public.police_transfer_applications add column admitted_at timestamptz, add column admission_operation_id uuid;

create function public.admit_police_transfer(
 p_user text,p_operation uuid,p_actor text,p_name text,p_plate text,p_steam text,
 p_approved_by text,p_unit text,p_expected_reviewed_at timestamptz,p_actor_name text,p_rank_role_id text,p_transfer_id uuid
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare candidate public.police_transfer_applications; profile public.police_personnel; prior public.police_rank_requests; selected_rank public.police_rank_roles;
begin
 if p_user !~ '^[0-9]{17,20}$' or p_actor !~ '^[0-9]{17,20}$' or p_operation is null or p_transfer_id is null
 or coalesce(length(trim(p_name)),0) not between 1 and 100 or coalesce(length(trim(p_plate)),0) not between 1 and 30
 or coalesce(length(trim(p_steam)),0) not between 1 and 100 or coalesce(length(trim(p_approved_by)),0) not between 1 and 100
 or p_unit not in ('POLICIA','UCOP','CIC') then return jsonb_build_object('ok',false,'error','Revisa los datos del ingreso.');end if;
 if p_rank_role_id is not null then
  select * into selected_rank from public.police_rank_roles where role_id=p_rank_role_id;
  if not found then return jsonb_build_object('ok',false,'error','El rango ya no está configurado. Actualiza los rangos.');end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('admission:'||p_user,0));
 select * into prior from public.police_rank_requests where id=p_operation;
 if found then
  if prior.discord_user_id=p_user and prior.status='accepted' and prior.review_reason='Ingreso administrativo desde Traslados.' then
   select * into profile from public.police_personnel where discord_user_id=p_user;
   return jsonb_build_object('ok',true,'existing',true,'personnel',to_jsonb(profile));
  end if;
  return jsonb_build_object('ok',false,'error','La referencia de este ingreso ya se utilizó. Actualiza la lista.');
 end if;
 select * into candidate from public.police_transfer_applications where id=p_transfer_id and discord_user_id=p_user for update;
 if not found or candidate.status<>'accepted' or candidate.admitted_at is not null then return jsonb_build_object('ok',false,'error','El traslado ya no está pendiente de ingresar a Personal.');end if;
 if p_expected_reviewed_at is not null and candidate.reviewed_at is distinct from p_expected_reviewed_at then return jsonb_build_object('ok',false,'error','El traslado cambió. Actualiza la lista antes de ingresar.');end if;
 if exists(select from public.police_personnel where discord_user_id=p_user) then return jsonb_build_object('ok',false,'error','Ya existe una ficha de este agente. Revísala en Personal.');end if;
 perform pg_advisory_xact_lock(hashtextextended('police-plate:'||trim(p_plate),0));
 if exists(select from public.police_personnel where plate=trim(p_plate) and status='active') then return jsonb_build_object('ok',false,'error','La placa ya está asignada a otro agente activo.');end if;
 insert into public.police_personnel(discord_user_id,discord_username,full_name,name_ooc,steam_username,plate,unit,rank_name,rank_role_id,status,source_application_id,last_rank_change_at)
 values(p_user,candidate.discord_username,trim(p_name),candidate.discord_username,trim(p_steam),trim(p_plate),p_unit,coalesce(selected_rank.role_name,'Pendiente de asignación'),p_rank_role_id,'active',null,case when p_rank_role_id is not null then now() end) returning * into profile;
 if p_rank_role_id is not null then
  insert into public.police_rank_history(discord_user_id,discord_username,full_name,action_type,new_role_id,new_rank_name,reason,changed_by_discord_id,changed_by_name)
  values(p_user,candidate.discord_username,trim(p_name),'assignment',p_rank_role_id,selected_rank.role_name,'Rango inicial al ingresar desde Traslados',p_actor,p_actor_name);
 end if;
 update public.police_transfer_applications set admitted_at=now(),admission_operation_id=p_operation where id=p_transfer_id;
 update public.police_rank_requests set status='rejected',review_reason='Resuelta mediante ingreso administrativo desde Traslados.',reviewed_by_discord_id=p_actor,reviewed_by_name=p_actor_name,reviewed_at=now(),updated_at=now() where discord_user_id=p_user and status='pending';
 insert into public.police_rank_requests(id,discord_user_id,discord_username,character_name,plate,steam_username,requested_rank_name,approved_by_name,status,reviewed_by_discord_id,reviewed_by_name,reviewed_at,review_reason)
 values(p_operation,p_user,candidate.discord_username,trim(p_name),trim(p_plate),trim(p_steam),coalesce(selected_rank.role_name,'Solo rol de Policía (sin rango configurado)'),trim(p_approved_by),'accepted',p_actor,p_actor_name,now(),'Ingreso administrativo desde Traslados.');
 insert into public.police_audit_events(action,fields)values('Ingreso administrativo desde Traslados',jsonb_build_array(jsonb_build_object('name','Agente','value',trim(p_name)),jsonb_build_object('name','Placa','value',trim(p_plate)),jsonb_build_object('name','División','value',p_unit),jsonb_build_object('name','Rango','value',coalesce(selected_rank.role_name,'Pendiente de asignación')),jsonb_build_object('name','Gestor','value',p_actor_name),jsonb_build_object('name','Entrevista IC aprobada por','value',trim(p_approved_by))));
 return jsonb_build_object('ok',true,'existing',false,'personnel',to_jsonb(profile));
end $$;
revoke all on function public.admit_police_transfer(text,uuid,text,text,text,text,text,text,timestamptz,text,text,uuid) from public,anon,authenticated;
grant execute on function public.admit_police_transfer(text,uuid,text,text,text,text,text,text,timestamptz,text,text,uuid) to service_role;
